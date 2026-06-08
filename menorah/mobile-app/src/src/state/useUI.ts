import { useState } from 'react';

export function useUI() {
  const [loading, setLoading] = useState(false);
  return { loading, setLoading };
}
