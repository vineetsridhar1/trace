import type { Components } from 'react-markdown';

export const MARKDOWN_COMPONENTS: Components = {
  a: ({ node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" />
  ),
};
