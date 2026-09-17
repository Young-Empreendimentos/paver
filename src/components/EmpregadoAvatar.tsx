import { useQuery } from '@tanstack/react-query';
import { UserRound } from 'lucide-react';
import { getSignedUrl, EMPREITEIROS_BUCKET } from '@/services/api';

/** Miniatura da foto do empregado (bucket privado -> URL assinada). */
export function EmpregadoAvatar({ path, size = 36 }: { path?: string | null; size?: number }) {
  const { data: url } = useQuery({
    queryKey: ['signed-url', path],
    queryFn: () => getSignedUrl(EMPREITEIROS_BUCKET, path as string, 3600),
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
  });
  return (
    <div
      className="shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {path && url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <UserRound className="text-muted-foreground" style={{ width: size * 0.5, height: size * 0.5 }} />
      )}
    </div>
  );
}
