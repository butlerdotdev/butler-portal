// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useRef, useEffect } from 'react';
import { ButtonGroup, Button, Box, Paper } from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import AccountTreeIcon from '@material-ui/icons/AccountTree';
import CodeIcon from '@material-ui/icons/Code';
import {
  EditorView,
  lineNumbers,
  highlightSpecialChars,
  highlightActiveLine,
} from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { yaml } from '@codemirror/lang-yaml';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    },
    toggleBar: {
      display: 'flex',
      justifyContent: 'center',
      padding: theme.spacing(1),
    },
    activeButton: {
      backgroundColor: theme.palette.primary.main,
      color: theme.palette.primary.contrastText,
      '&:hover': {
        backgroundColor: theme.palette.primary.dark,
      },
    },
    editorContainer: {
      flex: 1,
      overflow: 'auto',
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: theme.shape.borderRadius,
      margin: theme.spacing(0, 2, 2),
    },
  }),
);

interface ConfigToggleProps {
  mode: 'visual' | 'yaml';
  onModeChange: (mode: 'visual' | 'yaml') => void;
  yamlContent: string;
  children?: React.ReactNode;
}

export function ConfigToggle({
  mode,
  onModeChange,
  yamlContent,
  children,
}: ConfigToggleProps) {
  const classes = useStyles();
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (mode !== 'yaml' || !editorRef.current) return;

    const state = EditorState.create({
      doc: yamlContent,
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        highlightActiveLine(),
        yaml(),
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [mode, yamlContent]);

  return (
    <div className={classes.root}>
      <Box className={classes.toggleBar}>
        <ButtonGroup size="small" variant="outlined">
          <Button
            startIcon={<AccountTreeIcon />}
            className={mode === 'visual' ? classes.activeButton : undefined}
            onClick={() => onModeChange('visual')}
          >
            Visual
          </Button>
          <Button
            startIcon={<CodeIcon />}
            className={mode === 'yaml' ? classes.activeButton : undefined}
            onClick={() => onModeChange('yaml')}
          >
            YAML
          </Button>
        </ButtonGroup>
      </Box>
      {mode === 'visual' ? (
        children
      ) : (
        <Paper className={classes.editorContainer} variant="outlined">
          <div ref={editorRef} />
        </Paper>
      )}
    </div>
  );
}
