// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useRef, useEffect, useCallback } from 'react';
import { Box } from '@material-ui/core';
import { makeStyles, createStyles } from '@material-ui/core/styles';
import {
  EditorView,
  lineNumbers,
  highlightSpecialChars,
  highlightActiveLine,
  drawSelection,
  keymap,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { vrlLanguage } from './vrlLanguage';
import { vrlCompletions } from './vrlCompletions';

const useStyles = makeStyles(() =>
  createStyles({
    container: {
      border: '1px solid rgba(0, 0, 0, 0.23)',
      borderRadius: 4,
      overflow: 'hidden',
      '& .cm-editor': {
        fontFamily: '"Roboto Mono", "Fira Code", monospace',
        fontSize: '0.85rem',
      },
      '& .cm-gutters': {
        minWidth: 36,
      },
    },
  }),
);

interface VRLEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidate?: (value: string) => void;
  minHeight?: number;
}

export function VRLEditor({
  value,
  onChange,
  onValidate,
  minHeight = 200,
}: VRLEditorProps) {
  const classes = useStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleValidate = useCallback(
    (content: string) => {
      if (!onValidate) return;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        onValidate(content);
      }, 500);
    },
    [onValidate],
  );

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of(update => {
      if (update.docChanged) {
        const content = update.state.doc.toString();
        onChange(content);
        handleValidate(content);
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        highlightActiveLine(),
        drawSelection(),
        vrlLanguage(),
        vrlCompletions(),
        updateListener,
        EditorView.theme({
          '&': { minHeight: `${minHeight}px` },
          '.cm-scroller': { minHeight: `${minHeight}px` },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
    // Only create the editor once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes into the editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentContent = view.state.doc.toString();
    if (currentContent !== value) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: value,
        },
      });
    }
  }, [value]);

  return (
    <Box className={classes.container}>
      <div ref={containerRef} />
    </Box>
  );
}
