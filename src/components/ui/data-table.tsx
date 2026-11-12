import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Input } from './input';
import { Skeleton } from './skeleton';
import { EmptyState } from './empty-state';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './table';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  stickyRight?: boolean;
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  caption: string;
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T) => string;
  isLoading?: boolean;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}

export function DataTable<T>({
  caption,
  rows,
  columns,
  getRowKey,
  isLoading = false,
  searchPlaceholder,
  searchFilter,
  emptyTitle = 'No items',
  emptyDescription,
  emptyAction,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filteredRows = useMemo(() => {
    let list = rows;
    if (searchFilter && query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((r) => searchFilter(r, q));
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col?.sortValue) {
        const getter = col.sortValue;
        list = [...list].sort((a, b) => {
          const av = getter(a);
          const bv = getter(b);
          const cmp =
            typeof av === 'number' && typeof bv === 'number'
              ? av - bv
              : String(av).localeCompare(String(bv));
          return sortDir === 'asc' ? cmp : -cmp;
        });
      }
    }
    return list;
  }, [rows, query, searchFilter, sortKey, sortDir, columns]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="space-y-3">
      {searchFilter && (
        <div className="relative max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <Input
            inputSize="sm"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder ?? 'Filter...'}
            aria-label={searchPlaceholder ?? 'Filter rows'}
            className="pl-9"
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] p-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          action={emptyAction}
        />
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] shadow-[var(--shadow-xs)]">
          <Table>
            <TableCaption>{caption}</TableCaption>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={cn(
                      col.align === 'right' && 'text-right',
                      col.stickyRight && 'sticky right-0 z-[var(--z-sticky)] bg-[var(--color-bg-subtle)]',
                    )}
                  >
                    {col.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col.key)}
                        className="inline-flex items-center gap-1 hover:text-[var(--color-text-primary)] cursor-pointer"
                      >
                        <span>{col.header}</span>
                        {sortKey === col.key ? (
                          sortDir === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 opacity-60" strokeWidth={1.75} aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={getRowKey(row)}>
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(
                        col.align === 'right' && 'text-right',
                        col.stickyRight && 'sticky right-0 z-[var(--z-sticky)] bg-[var(--color-bg-surface)]',
                      )}
                    >
                      {col.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
