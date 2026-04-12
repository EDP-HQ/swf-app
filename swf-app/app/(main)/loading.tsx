/**
 * Shown immediately on client navigations while the next segment loads.
 * Improves perceived performance for heavy pages (bobbin, warehouse, ESL).
 */
export default function MainLoading() {
    return (
        <div
            className="flex align-items-center justify-content-center w-full"
            style={{ minHeight: '12rem' }}
            aria-busy="true"
            aria-label="Loading page"
        >
            <i className="pi pi-spin pi-spinner text-4xl text-primary" />
        </div>
    );
}
