type IconName =
  | 'search'
  | 'close'
  | 'plus'
  | 'more'
  | 'trash'
  | 'info'
  | 'palette'
  | 'edit'
  | 'motion'
  | 'book'
  | 'folder'
  | 'clock'
  | 'chevron'
  | 'grip'

const PATHS: Record<IconName, string> = {
  search: 'M11 4a7 7 0 1 0 4.19 12.6l3.6 3.6 1.42-1.42-3.6-3.6A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  close: 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5Z',
  plus: 'M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7V4Z',
  more: 'M6 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm6 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
  trash: 'M9 3h6l1 2h4v2H4V5h4l1-2ZM6 8h12l-1 12H7L6 8Zm3 2v8h2v-8H9Zm4 0v8h2v-8h-2Z',
  info: 'M11 2a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4a1.2 1.2 0 1 1 0 2.4A1.2 1.2 0 0 1 11 6Zm1.2 10h-2.4V10h2.4v6Z',
  palette: 'M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-.9-.5-1.3-.3-.3-.5-.7-.5-1.2 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-3.9-4-7-9-7Zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3.5 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z',
  edit: 'M4 16.5V20h3.5l10-10-3.5-3.5-10 10ZM18.7 5.3a1 1 0 0 0 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0L13 3l3.5 3.5 1.7-1.7Z',
  motion: 'M4 6h9a4 4 0 0 1 0 8H4V6Zm0 2v4h9a2 2 0 0 0 0-4H4Zm16.5 2.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z',
  book: 'M4 4h6a3 3 0 0 1 3 3v10a2.5 2.5 0 0 0-2.5-2.5H4V4Zm16 0h-6a3 3 0 0 0-3 3v10a2.5 2.5 0 0 1 2.5-2.5H20V4Z',
  folder: 'M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z',
  clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5h-2v6l5 3 1-1.6-4-2.4V7Z',
  chevron: 'M9 5l7 7-7 7-1.4-1.4L13.2 12 7.6 6.4 9 5Z',
  grip: 'M9 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm-6 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm-6 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm6 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z',
}

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

export type { IconName }
