import config from '@knowledgehub/eslint-config/nest';

export default [
  { ignores: ['src/generated/**'] },
  ...config,
];
