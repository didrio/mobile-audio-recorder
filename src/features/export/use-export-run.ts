import { useEffect, useRef, useState } from 'react';

import {
  cleanUp,
  ExportCancelled,
  share,
  type CancelToken,
  type ExportProgress,
  type ExportResult,
} from './export-runner';

export type ExportRunStatus =
  | { kind: 'idle' }
  | { kind: 'running'; progress: ExportProgress }
  | { kind: 'sharing' }
  | { kind: 'error'; message: string };

type Work = (run: {
  token: CancelToken;
  onProgress: (progress: ExportProgress) => void;
}) => Promise<ExportResult>;

/**
 * One export at a time from a sheet: runs the work with progress and a cancel token, shares the
 * result, deletes the files once the share sheet closes. Closing the sheet cancels a running export.
 */
export function useExportRun() {
  const [status, setStatus] = useState<ExportRunStatus>({ kind: 'idle' });
  const token = useRef<CancelToken | null>(null);

  useEffect(
    () => () => {
      if (token.current) token.current.cancelled = true;
    },
    [],
  );

  const start = async (work: Work) => {
    if (token.current) return;
    const current: CancelToken = { cancelled: false };
    token.current = current;
    setStatus({ kind: 'running', progress: { done: 0, total: 1, label: 'Preparing' } });
    try {
      const result = await work({
        token: current,
        onProgress: (progress) => {
          if (!current.cancelled) setStatus({ kind: 'running', progress });
        },
      });
      if (current.cancelled) {
        cleanUp(result);
        return;
      }
      setStatus({ kind: 'sharing' });
      try {
        await share(result);
      } finally {
        cleanUp(result);
      }
      setStatus({ kind: 'idle' });
    } catch (error) {
      if (error instanceof ExportCancelled || current.cancelled) setStatus({ kind: 'idle' });
      else {
        setStatus({
          kind: 'error',
          message: error instanceof Error && error.message ? error.message : 'Export failed.',
        });
      }
    } finally {
      token.current = null;
    }
  };

  const cancel = () => {
    if (token.current) token.current.cancelled = true;
    setStatus({ kind: 'idle' });
  };

  return {
    status,
    start,
    cancel,
    busy: status.kind === 'running' || status.kind === 'sharing',
  };
}
