import type { ReactNode } from 'react';

type Props = {
  readonly title?: ReactNode;
  readonly titleId?: string;
  readonly wide?: boolean;
  readonly children: ReactNode;
  readonly as?: 'section' | 'div';
};

/** Wooden frame panel drawn with the atlas 9-slice borders (32 / 40 px). */
export function Panel({ title, titleId, wide = false, children, as: Tag = 'section' }: Props) {
  return (
    <Tag className={wide ? 'panel panel--wide' : 'panel'} aria-labelledby={title ? titleId : undefined}>
      <div className="panel__inner">
        {title && (
          <h1 className="panel__title" id={titleId}>
            {title}
          </h1>
        )}
        {children}
      </div>
    </Tag>
  );
}
