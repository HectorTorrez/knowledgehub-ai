import config from '@knowledgehub/eslint-config/react';

export default [
  ...config,
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/lib/webmcp/**',
      'src/hooks/use-webmcp-tool.ts',
      'src/hooks/use-webmcp-tools.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/webmcp/**', '**/webmcp'],
              message:
                'WebMCP is an isolated progressive enhancement. Only the tool-assembly hooks may import it.',
            },
          ],
        },
      ],
    },
  },
];
