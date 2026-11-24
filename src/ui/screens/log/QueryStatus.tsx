import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Page } from '../../../api/contracts';
import { toApiError } from '../../../api/http';
import { MenuButton } from '../../components/Buttons';
import { assetUrl } from '../../../assetUrl';

type Props<T> = {
  readonly query: UseQueryResult<Page<T>>;
  readonly label: string;
  readonly emptyMessage: string;
  readonly children: (page: Page<T>) => ReactNode;
};

/** Renders loading / error / empty / data states for a paginated query. */
export function QueryStatus<T>({ query, label, emptyMessage, children }: Props<T>) {
  if (query.isPending) {
    return (
      <div className="query-state" role="status" aria-busy="true">
        Loading {label}…
      </div>
    );
  }
  if (query.isError && !query.data) {
    return (
      <div className="query-state">
        <p className="notice notice--error" role="alert">
          Could not load {label}. {toApiError(query.error).message}
        </p>
        <MenuButton size="small" onClick={() => void query.refetch()}>
          Try again
        </MenuButton>
      </div>
    );
  }
  const page = query.data;
  if (!page || page.items.length === 0) {
    return (
      <div className="query-state" role="status">
        {emptyMessage}
      </div>
    );
  }
  return <>{children(page)}</>;
}

type PaginationProps = {
  readonly page: number;
  readonly totalPages: number;
  readonly label: string;
  readonly onChange: (page: number) => void;
};

export function Pagination({ page, totalPages, label, onChange }: PaginationProps) {
  return (
    <nav className="pagination" aria-label={`${label} pages`}>
      <button
        type="button"
        className="round-button"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <img src={assetUrl('ui/controls/icon_turn_left.png')} alt="" width={30} height={30} />
      </button>
      <span aria-live="polite">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="round-button"
        aria-label="Next page"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        <img src={assetUrl('ui/controls/icon_turn_right.png')} alt="" width={30} height={30} />
      </button>
    </nav>
  );
}

/** Background refresh indicator (data already visible). */
export function UpdatingHint({ query }: { readonly query: UseQueryResult<unknown> }) {
  const refreshing = query.isFetching && !query.isPending;
  const failedRefresh = query.isError && query.data !== undefined;
  return (
    <p className="updating" role="status">
      {refreshing ? 'Updating…' : failedRefresh ? 'Showing saved data — refresh failed.' : ''}
    </p>
  );
}
