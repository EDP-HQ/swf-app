import type { M2bVerificationRow } from "./fetchM2bVerification";

export type DoughnutChartData = {
    labels: string[];
    datasets: {
        data: number[];
        backgroundColor: string[];
        borderWidth: number;
        borderColor: string;
    }[];
};

export function buildRackDoughnutCharts(rackData: M2bVerificationRow[], rackType: string) {
    const totalLocations = rackData.length;
    const maxCellsPerRack = rackType === "7 Rack" ? 7 : 5;
    const totalCells = totalLocations * maxCellsPerRack;

    const occupiedLocations = rackData.filter((item) => (item.TOTAL_CNT || 0) > 0).length;
    const availableLocations = totalLocations - occupiedLocations;

    const locationChart: DoughnutChartData = {
        labels: ["Occupied", "Available"],
        datasets: [
            {
                data: [occupiedLocations, availableLocations],
                backgroundColor: ["#667eea", "#e0e0e0"],
                borderWidth: 2,
                borderColor: "#fff"
            }
        ]
    };

    const occupiedCells = rackData.reduce((sum, item) => sum + (item.TOTAL_CNT || 0), 0);
    const availableCells = Math.max(0, totalCells - occupiedCells);

    const cellChart: DoughnutChartData = {
        labels: ["Occupied", "Available"],
        datasets: [
            {
                data: [occupiedCells, availableCells],
                backgroundColor: ["#764ba2", "#e0e0e0"],
                borderWidth: 2,
                borderColor: "#fff"
            }
        ]
    };

    const shortLengthCount = rackData.filter((item) => item.FLAG1 === "N").length;
    const normalLengthCount = rackData.filter((item) => item.FLAG1 === "Y").length;

    const flag1Chart: DoughnutChartData = {
        labels: ["Short Length", "Normal Length"],
        datasets: [
            {
                data: [shortLengthCount, normalLengthCount],
                backgroundColor: ["#080808", "#4CAF50"],
                borderWidth: 2,
                borderColor: "#fff"
            }
        ]
    };

    const wrongItemCount = rackData.filter((item) => item.FLAG2 === "N").length;
    const correctItemCount = rackData.filter((item) => item.FLAG2 === "Y").length;

    const flag2Chart: DoughnutChartData = {
        labels: ["Wrong Item", "Correct Item"],
        datasets: [
            {
                data: [wrongItemCount, correctItemCount],
                backgroundColor: ["#f70505", "#4CAF50"],
                borderWidth: 2,
                borderColor: "#fff"
            }
        ]
    };

    return { locationChart, cellChart, flag1Chart, flag2Chart };
}

export function createRackDoughnutOptions() {
    return {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            datalabels: false as const,
            legend: {
                position: "bottom" as const,
                labels: {
                    font: { size: 14, weight: "bold" as const },
                    padding: 15,
                    generateLabels(chart: {
                        data: {
                            labels: string[];
                            datasets: { data: number[]; backgroundColor: string[] }[];
                        };
                    }) {
                        const { data } = chart;
                        if (!data.labels.length || !data.datasets.length) return [];
                        return data.labels.map((label, i) => {
                            const value = data.datasets[0].data[i];
                            const total = data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
                            return {
                                text: `${label}: ${value} (${percentage}%)`,
                                fillStyle: data.datasets[0].backgroundColor[i],
                                hidden: false,
                                index: i
                            };
                        });
                    }
                }
            },
            tooltip: {
                callbacks: {
                    label(context: { label?: string; parsed?: number; dataset: { data: number[] } }) {
                        const label = context.label || "";
                        const value = context.parsed || 0;
                        const total = context.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
                        return `${label}: ${value} (${percentage}%)`;
                    }
                }
            }
        }
    };
}
