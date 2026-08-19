"use client";

import { useState } from "react";
import { BookOpen, ChevronDown, ExternalLink } from "lucide-react";

// PEDI-GROWTH — Clinical References Panel
// Provides evidence-based context for the assessment methodology.

interface Reference {
  authors: string;
  year: number;
  title: string;
  journal: string;
  relevance: string;
  doi?: string;
}

const REFERENCES: Reference[] = [
  {
    authors: "Baker R",
    year: 2006,
    title: "Gait analysis methods in rehabilitation",
    journal: "J NeuroEng Rehabil",
    relevance: "Establishes the foundational gait analysis methodology used in movement pattern assessment.",
    doi: "10.1186/1743-0003-3-4",
  },
  {
    authors: "Schwartz MH, Rozumalski A",
    year: 2008,
    title: "The Gait Deviation Index: a new comprehensive index of gait pathology",
    journal: "Gait & Posture",
    relevance: "Defines the standard measure for quantifying gait deviation from typical patterns, informing our concern level thresholds.",
    doi: "10.1016/j.gaitpost.2007.08.006",
  },
  {
    authors: "Cimolin V, Galli M",
    year: 2014,
    title: "Summary measures for clinical gait analysis: a literature review",
    journal: "Gait & Posture",
    relevance: "Reviews the key gait metrics used in clinical assessment, validating our feature selection approach.",
    doi: "10.1016/j.gaitpost.2014.06.001",
  },
  {
    authors: "Kanko RM et al.",
    year: 2021,
    title: "Concurrent assessment of gait kinematics using marker-based and markerless motion capture",
    journal: "Journal of Biomechanics",
    relevance: "Validates markerless pose estimation (similar to MediaPipe) for gait analysis against gold-standard motion capture.",
    doi: "10.1016/j.jbiomech.2021.110665",
  },
  {
    authors: "Stenum J et al.",
    year: 2021,
    title: "Two-dimensional video-based analysis of human gait using pose estimation",
    journal: "PLOS Computational Biology",
    relevance: "Demonstrates that video-based pose estimation can reliably extract clinically relevant gait parameters.",
    doi: "10.1371/journal.pcbi.1008935",
  },
];

export default function ClinicalReferencesPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="rounded-[1.5rem] bg-surface-container-low">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-surface-variant/50"
      >
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Clinical References & Methodology</span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-1 animate-fade-in">
          <p className="mb-3 text-xs text-muted-foreground">
            Pedi-Growth&apos;s analysis methodology is informed by the following clinical
            research. This tool applies video-based pose estimation to extract movement
            metrics validated in clinical gait analysis literature.
          </p>

          <div className="space-y-3">
            {REFERENCES.map((ref, i) => (
              <div key={i} className="rounded-2xl bg-surface-container-lowest p-3 shadow-[0_12px_32px_rgba(21,29,28,0.06)]">
                <p className="text-xs font-medium text-foreground">
                  {ref.authors} ({ref.year})
                </p>
                <p className="mt-0.5 text-xs italic text-foreground/80">
                  {ref.title}
                </p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {ref.journal}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  → {ref.relevance}
                </p>
                {ref.doi && (
                  <a
                    href={`https://doi.org/${ref.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    DOI: {ref.doi}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 rounded-2xl bg-secondary-container/70 p-3 text-[11px] text-secondary-foreground">
            <strong>Methodology Note:</strong> Pedi-Growth uses MediaPipe Pose
            (Google) for markerless body landmark extraction from standard smartphone
            video. Extracted landmarks are processed through deterministic algorithms
            to compute gait metrics. Concern levels are derived from configurable
            thresholds, not ML prediction — ensuring transparency and reproducibility.
          </div>
        </div>
      )}
    </div>
  );
}
