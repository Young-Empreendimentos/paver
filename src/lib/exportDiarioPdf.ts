import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AtividadeRow {
  codigo: string;
  descricao: string;
  pacote: string;
  lote: string;
  qtdTotal: string;
  qtdDia: string;
  acumulada: string;
  saldo: string;
  percentual: string;
}

interface DiarioPdfData {
  data: string;
  obraNome: string;
  climaManha: string;
  climaTarde: string;
  equipes: string;
  observacoes: string;
  autor: string;
  criadoEm: string;
  atividades: AtividadeRow[];
  fotoUrls: string[];
}

const climaLabels: Record<string, string> = {
  ensolarado: 'Ensolarado',
  nublado: 'Nublado',
  parcialmente_nublado: 'Parc. Nublado',
  chuvoso: 'Chuvoso',
  frio: 'Frio',
};

function formatClimaLabel(clima: string): string {
  return climaLabels[clima] || clima || '—';
}

export async function exportDiarioPdf(d: DiarioPdfData) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 15;
  let y = margin;

  // ── Title ──
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Diário de Obra', margin, y);
  y += 8;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(d.data, margin, y);
  y += 10;

  // ── Header info ──
  doc.setFontSize(9);
  const headerLines = [
    ['Obra', d.obraNome],
    ['Clima Manhã', formatClimaLabel(d.climaManha)],
    ['Clima Tarde', formatClimaLabel(d.climaTarde)],
    ['Equipes', d.equipes || '—'],
    ['Autor', d.autor || '—'],
    ['Registrado em', d.criadoEm || '—'],
  ];

  headerLines.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}: `, margin, y);
    const labelWidth = doc.getTextWidth(`${label}: `);
    doc.setFont('helvetica', 'normal');
    doc.text(value, margin + labelWidth, y);
    y += 5;
  });

  if (d.observacoes) {
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.text('Observações:', margin, y);
    y += 5;
    doc.setFont('helvetica', 'italic');
    const obsLines = doc.splitTextToSize(d.observacoes, pageWidth - margin * 2);
    doc.text(obsLines, margin, y);
    y += obsLines.length * 4 + 2;
  }

  y += 5;

  // ── Atividades table ──
  if (d.atividades.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Atividades Medidas', margin, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Código', 'Descrição', 'Pacote', 'Lote', 'Qtd. Total', 'Qtd. Dia', 'Acumulada', 'Saldo', '%']],
      body: d.atividades.map(a => [
        a.codigo, a.descricao, a.pacote, a.lote,
        a.qtdTotal, a.qtdDia, a.acumulada, a.saldo, a.percentual,
      ]),
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [41, 55, 72], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 'auto' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right' },
        8: { halign: 'right', cellWidth: 10 },
      },
      didDrawPage: () => {
        // footer
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(
          `Gerado em ${new Date().toLocaleString('pt-BR')}`,
          pageWidth - margin,
          doc.internal.pageSize.getHeight() - 5,
          { align: 'right' }
        );
      },
    });

    y = (doc as any).lastAutoTable?.finalY || y + 10;
  } else {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('Nenhuma atividade medida neste diário.', margin, y);
    y += 6;
  }

  // ── Fotos ──
  if (d.fotoUrls.length > 0) {
    // Add new page for photos
    doc.addPage();
    y = margin;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`Fotos (${d.fotoUrls.length})`, margin, y);
    y += 8;

    const imgSize = 55;
    const cols = 3;
    const gap = 5;
    let col = 0;

    for (const url of d.fotoUrls) {
      // Skip videos
      if (/\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url)) continue;

      try {
        const imgData = await loadImageAsBase64(url);
        const x = margin + col * (imgSize + gap);
        doc.addImage(imgData, 'JPEG', x, y, imgSize, imgSize);
        col++;
        if (col >= cols) {
          col = 0;
          y += imgSize + gap;
          if (y + imgSize > doc.internal.pageSize.getHeight() - margin) {
            doc.addPage();
            y = margin;
          }
        }
      } catch (err) {
        console.warn('[exportDiarioPdf] Falha ao carregar imagem:', url, err);
      }
    }
  }

  // Footer on last page
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Gerado em ${new Date().toLocaleString('pt-BR')}`,
    pageWidth - margin,
    doc.internal.pageSize.getHeight() - 5,
    { align: 'right' }
  );

  // Save
  const safeName = d.obraNome.replace(/[^a-zA-Z0-9À-ÿ ]/g, '').replace(/\s+/g, '_').slice(0, 30);
  const dateStr = d.data.replace(/\//g, '-').replace(/\s/g, '');
  doc.save(`Diario_${safeName}_${dateStr}.pdf`);
}

async function loadImageAsBase64(url: string): Promise<string> {
  // Fetch as blob first → avoids canvas CORS tainting and works for any image format
  let blobUrl: string | null = null;
  let srcForImg = url;
  try {
    const resp = await fetch(url, { mode: 'cors', cache: 'no-cache' });
    if (resp.ok) {
      const blob = await resp.blob();
      blobUrl = URL.createObjectURL(blob);
      srcForImg = blobUrl;
    }
  } catch {
    // fall through to direct <img> load with crossOrigin
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    if (srcForImg === url) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const maxDim = 600;
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) { reject(new Error('Imagem sem dimensões')); return; }
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      } finally {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      }
    };
    img.onerror = (e) => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      reject(e);
    };
    img.src = srcForImg;
  });
}
