import config from '@knowledgehub/eslint-config/nest';

export default [
  // Prisma generates its client into `src/generated`; it is not our code.
  { ignores: ['src/generated/**'] },
  ...config,
];
