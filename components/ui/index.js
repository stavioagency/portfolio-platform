// UI primitives — the shared design-system layer for the admin.
// Everything here is plain React + styled-jsx on the tokens in styles/globals.css.
// No Tailwind, no component library, no new runtime dependencies.
export { default as Button } from './Button';
export { default as Card, CardHeader } from './Card';
export { default as PageHeader } from './PageHeader';
export { default as Badge } from './Badge';
export { default as Riyal } from './Riyal';
export { default as Money } from './Money';
export { default as Icon, ICON_NAMES } from './Icon';
export { default as Input, Hint } from './Input';
export { default as EmptyState } from './EmptyState';
export { default as Skeleton, SkeletonText } from './Skeleton';
export { ToastProvider, useToast } from './Toast';
export { ConfirmProvider, useConfirm } from './ConfirmDialog';
