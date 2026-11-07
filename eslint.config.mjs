import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  // Diagnósticos novos do React Compiler ficam visíveis nesta migração sem
  // transformar a atualização de segurança numa reescrita dos formulários.
  // O compiler não está habilitado. Rules-of-hooks e exhaustive-deps mantêm
  // suas severidades; a adoção estrita destes diagnósticos é uma etapa própria.
  { rules: {
    'react-hooks/immutability': 'warn',
    'react-hooks/preserve-manual-memoization': 'warn',
    'react-hooks/purity': 'warn',
    'react-hooks/refs': 'warn',
    'react-hooks/set-state-in-effect': 'warn',
  } },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
]);
