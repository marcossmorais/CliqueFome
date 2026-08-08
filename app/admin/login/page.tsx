import { Suspense } from 'react';
import { FormularioLogin } from './FormularioLogin';
import '../admin.css';

/**
 * O formulário lê ?proximo= da URL com useSearchParams, que obriga o Next
 * a ter um limite de Suspense pra conseguir pré-renderizar esta página.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <FormularioLogin />
    </Suspense>
  );
}
