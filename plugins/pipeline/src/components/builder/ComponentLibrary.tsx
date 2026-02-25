// Copyright 2026 The Butler Authors.
// SPDX-License-Identifier: Apache-2.0

import { useState, useEffect, useMemo, DragEvent } from 'react';
import {
  Box,
  TextField,
  Typography,
  InputAdornment,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Collapse,
  Divider,
} from '@material-ui/core';
import { makeStyles, Theme, createStyles } from '@material-ui/core/styles';
import SearchIcon from '@material-ui/icons/Search';
import InputIcon from '@material-ui/icons/Input';
import TransformIcon from '@material-ui/icons/Transform';
import CallMadeIcon from '@material-ui/icons/CallMade';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import ChevronRightIcon from '@material-ui/icons/ChevronRight';
import { Progress } from '@backstage/core-components';
import { usePipelineApi } from '../../hooks/usePipelineApi';
import type { ComponentSchema } from '../../api/types/pipelines';

const CATEGORY_ORDER = ['Sources', 'Transforms', 'Sinks'];

const TYPE_ICONS: Record<string, React.ComponentType<any>> = {
  source: InputIcon,
  transform: TransformIcon,
  sink: CallMadeIcon,
};

const TYPE_COLORS: Record<string, string> = {
  source: '#4caf50',
  transform: '#2196f3',
  sink: '#ff9800',
};

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    root: {
      width: 260,
      height: '100%',
      borderRight: `1px solid ${theme.palette.divider}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    },
    searchBox: {
      padding: theme.spacing(1.5),
    },
    listContainer: {
      flex: 1,
      overflowY: 'auto',
    },
    categoryHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: theme.spacing(0.75, 2, 0.75, 1.5),
      cursor: 'pointer',
      userSelect: 'none',
      '&:hover': {
        backgroundColor:
          theme.palette.type === 'dark'
            ? 'rgba(255,255,255,0.05)'
            : 'rgba(0,0,0,0.04)',
      },
    },
    categoryLeft: {
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(0.5),
    },
    categoryLabel: {
      fontWeight: 700,
      fontSize: '0.75rem',
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: theme.palette.text.secondary,
    },
    categoryCount: {
      fontSize: '0.7rem',
      color: theme.palette.text.hint,
      marginLeft: theme.spacing(0.5),
    },
    expandIcon: {
      color: theme.palette.text.secondary,
      fontSize: '1.1rem',
      transition: 'transform 0.2s',
    },
    draggableItem: {
      cursor: 'grab',
      '&:active': {
        cursor: 'grabbing',
      },
    },
    itemIcon: {
      minWidth: 36,
    },
  }),
);

export function ComponentLibrary() {
  const classes = useStyles();
  const api = usePipelineApi();

  const [components, setComponents] = useState<ComponentSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await api.listComponents();
        if (!cancelled) setComponents(result);
      } catch (err) {
        console.error('[ComponentLibrary] Failed to load components:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const grouped = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    const filtered = components.filter(
      c =>
        c.displayName.toLowerCase().includes(lowerSearch) ||
        c.vectorType.toLowerCase().includes(lowerSearch) ||
        c.description.toLowerCase().includes(lowerSearch),
    );

    const typeToCategory: Record<string, string> = {
      source: 'Sources',
      transform: 'Transforms',
      sink: 'Sinks',
    };

    const groups: Record<string, ComponentSchema[]> = {};
    for (const schema of filtered) {
      const key = typeToCategory[schema.type] ?? 'Transforms';
      if (!groups[key]) groups[key] = [];
      groups[key].push(schema);
    }

    return CATEGORY_ORDER.filter(cat => groups[cat]?.length).map(cat => ({
      category: cat,
      items: groups[cat].sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      ),
    }));
  }, [components, search]);

  const toggleCategory = (category: string) => {
    setCollapsed(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    schema: ComponentSchema,
  ) => {
    event.dataTransfer.setData(
      'application/butler-pipeline-component',
      JSON.stringify({
        type: schema.type,
        vectorType: schema.vectorType,
        displayName: schema.displayName,
        defaultConfig: schema.defaultConfig,
        configSchema: schema.configSchema,
      }),
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  if (loading) {
    return (
      <Box className={classes.root}>
        <Progress />
      </Box>
    );
  }

  return (
    <Box className={classes.root}>
      <div className={classes.searchBox}>
        <TextField
          fullWidth
          size="small"
          variant="outlined"
          placeholder="Search components..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </div>
      <div className={classes.listContainer}>
        {grouped.length === 0 && (
          <Typography
            variant="body2"
            color="textSecondary"
            style={{ padding: 16 }}
          >
            No components found.
          </Typography>
        )}
        {grouped.map(group => {
          const isCollapsed = !!collapsed[group.category];
          return (
            <div key={group.category}>
              <div
                className={classes.categoryHeader}
                onClick={() => toggleCategory(group.category)}
              >
                <div className={classes.categoryLeft}>
                  {isCollapsed ? (
                    <ChevronRightIcon className={classes.expandIcon} />
                  ) : (
                    <ExpandMoreIcon className={classes.expandIcon} />
                  )}
                  <span className={classes.categoryLabel}>
                    {group.category}
                  </span>
                  <span className={classes.categoryCount}>
                    ({group.items.length})
                  </span>
                </div>
              </div>
              <Collapse in={!isCollapsed}>
                <List dense disablePadding>
                  {group.items.map(schema => {
                    const IconComponent =
                      TYPE_ICONS[schema.type] ?? TransformIcon;
                    const iconColor = TYPE_COLORS[schema.type] ?? '#999';
                    return (
                      <ListItem
                        key={schema.vectorType}
                        className={classes.draggableItem}
                        draggable
                        onDragStart={(e: any) => handleDragStart(e, schema)}
                      >
                        <ListItemIcon className={classes.itemIcon}>
                          <IconComponent style={{ color: iconColor }} />
                        </ListItemIcon>
                        <ListItemText
                          primary={schema.displayName}
                          secondary={schema.vectorType}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondaryTypographyProps={{
                            variant: 'caption',
                          }}
                        />
                      </ListItem>
                    );
                  })}
                </List>
              </Collapse>
              <Divider />
            </div>
          );
        })}
      </div>
    </Box>
  );
}
