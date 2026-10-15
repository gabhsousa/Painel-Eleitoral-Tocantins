export function LoadState({ loading, error }: { loading: boolean; error: string }) {
  return loading ? (
    <p className="load-state" role="status">
      Consultando dados…
    </p>
  ) : error ? (
    <p className="load-state error" role="alert">
      {error}
    </p>
  ) : null;
}
