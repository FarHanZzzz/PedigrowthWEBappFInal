"use client";

import { useEffect, useMemo, useState } from "react";
import { Footprints, Play } from "lucide-react";
import {
  captureThumbnailFromUrl,
  captureVideoThumbnail,
} from "@/lib/history/captureVideoThumbnail";
import { getPlaybackVideo } from "@/lib/session/videoStore";
import type { HistoryStatus } from "@/lib/history/historyTypes";

interface HistoryCardCoverProps {
  resultId: string;
  sessionId: string | null;
  videoUrl: string | null;
  childName: string;
  status: HistoryStatus;
}

const STATUS_GRADIENT: Record<HistoryStatus, string> = {
  stable:
    "from-emerald-500/25 via-primary/15 to-muted/40 dark:from-emerald-500/20 dark:via-primary/10 dark:to-muted/30",
  follow_up:
    "from-amber-500/30 via-orange-500/10 to-muted/40 dark:from-amber-500/25 dark:via-orange-500/10 dark:to-muted/30",
  retake:
    "from-red-500/25 via-rose-500/10 to-muted/40 dark:from-red-500/20 dark:via-rose-500/10 dark:to-muted/30",
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export default function HistoryCardCover({
  resultId,
  sessionId,
  videoUrl,
  childName,
  status,
}: HistoryCardCoverProps) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const initials = useMemo(() => initialsFromName(childName), [childName]);
  const gradient = STATUS_GRADIENT[status];

  useEffect(() => {
    let cancelled = false;

    const loadThumbnail = async () => {
      if (videoUrl) {
        const fromCloud = await captureThumbnailFromUrl(videoUrl);
        if (!cancelled && fromCloud) {
          setThumbnail(fromCloud);
          setLoaded(true);
          return;
        }
      }

      const playback = await getPlaybackVideo(resultId, sessionId);
      if (playback?.blob) {
        const fromLocal = await captureVideoThumbnail(playback.blob);
        if (!cancelled && fromLocal) {
          setThumbnail(fromLocal);
          setLoaded(true);
          return;
        }
      }

      if (!cancelled) {
        setLoaded(true);
      }
    };

    void loadThumbnail();

    return () => {
      cancelled = true;
    };
  }, [resultId, sessionId, videoUrl]);

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted/40">
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnail}
          alt={`Walking check for ${childName}`}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div
          className={`flex h-full w-full flex-col items-center justify-center bg-gradient-to-br ${gradient} ${
            loaded ? "" : "animate-pulse"
          }`}
        >
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-background/70 text-primary shadow-sm backdrop-blur-sm">
            <span className="text-lg font-semibold tracking-tight">{initials}</span>
          </span>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-background/60 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
            <Footprints className="h-3.5 w-3.5 text-primary" />
            Walking clip
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />

      <span className="pointer-events-none absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/45 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-sm">
        <Play className="h-3 w-3 fill-current" />
        Open summary
      </span>
    </div>
  );
}
