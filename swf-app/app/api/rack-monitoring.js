import axios from "axios";

const localapi = "http://194.1.31.11:3222/";
//const localapi = "http://localhost:3222/";

// 날짜 형식 변환 함수 (YYYY-MM-DD HH24:MM:SS)
const formatDateTime = (dateString) => {
    if (!dateString) return '';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
        console.error('Date formatting error:', error);
        return '';
    }
};

// 전체 대시보드 데이터 조회
export const getDashboardOverview = async () => {
    try {
        const response = await axios.get(localapi + "rack/dashboard/overview", {
            timeout: 5000,
            params: {
                udate: Date.now(),
            },
        });
        
        // 실제 데이터를 대시보드 형식에 맞게 변환
        const rawData = response.data;
        console.log('Raw dashboard data:', rawData);
        
        if (Array.isArray(rawData) && rawData.length > 0) {
            // TOTAL_RACKS: 전체 행 수
            const totalRacks = rawData.length;
            
            // OCCUPIED_RACKS: TOTAL_CNT가 1 이상인 것들의 개수
            const occupiedRacks = rawData.filter(item => (item.TOTAL_CNT || 0) >= 1).length;
            
            // AVAILABLE_RACKS: TOTAL_CNT가 0인 것들의 개수
            const availableRacks = rawData.filter(item => (item.TOTAL_CNT || 0) === 0).length;
            
            // TOTAL_PRODUCTS: TOTAL_CNT 전체의 합
            const totalProducts = rawData.reduce((sum, item) => sum + (item.TOTAL_CNT || 0), 0);
            
            // 활용률 계산
            const utilizationRate = totalRacks > 0 ? Math.round((occupiedRacks / totalRacks) * 100) : 0;
            
            // 제품 상태별 계산
            const totalNormalProducts = rawData.reduce((sum, item) => sum + (item.NORMAL_CNT || 0), 0);
            const totalAbnormalProducts = rawData.reduce((sum, item) => sum + (item.ABNORMAL_CNT || 0), 0);
            
            // Rack Type별 수량 계산
            const rackTypeCounts = {
                '7 Rack': rawData.filter(item => item.CDNAME === '7 Rack').reduce((sum, item) => sum + (item.TOTAL_CNT || 0), 0),
                '5 Rack': rawData.filter(item => item.CDNAME === '5 Rack').reduce((sum, item) => sum + (item.TOTAL_CNT || 0), 0),
                '1 Rack': rawData.filter(item => item.CDNAME === '1 Rack').reduce((sum, item) => sum + (item.TOTAL_CNT || 0), 0),
                'RW-B': rawData.filter(item => item.CDNAME === 'RW-B').reduce((sum, item) => sum + (item.TOTAL_CNT || 0), 0)
            };
            
            return {
                totalRacks,
                occupiedRacks,
                availableRacks,
                utilizationRate,
                totalProducts,
                activeTags: totalNormalProducts,
                inactiveTags: totalAbnormalProducts,
                rackTypeCounts
            };
        }
        
        // 데이터가 없거나 배열이 아닌 경우 "No Data Available" 반환
        return {
            totalRacks: 0,
            occupiedRacks: 0,
            availableRacks: 0,
            utilizationRate: 0,
            totalProducts: 0,
            activeTags: 0,
            inactiveTags: 0,
            rackTypeCounts: {
                '7 Rack': 0,
                '5 Rack': 0,
                '1 Rack': 0,
                'RW-B': 0
            }
        };
    } catch (error) {
        console.error("Error fetching dashboard overview:", error);
        // 실제 API가 없을 때를 위한 "No Data Available" 반환
        return {
            totalRacks: 0,
            occupiedRacks: 0,
            availableRacks: 0,
            utilizationRate: 0,
            totalProducts: 0,
            activeTags: 0,
            inactiveTags: 0,
            rackTypeCounts: {
                '7 Rack': 0,
                '5 Rack': 0,
                '1 Rack': 0,
                'RW-B': 0
            }
        };
    }
};

// Rack Type별 요약 데이터 조회
export const getRackTypeSummary = async () => {
    try {
        const response = await axios.get(localapi + "rack/types/summary", {
            timeout: 5000,
            params: {
                udate: Date.now(),
            },
        });
        
        // 실제 데이터를 Rack Type 형식에 맞게 변환
        const rawData = response.data;
        console.log('Raw rack type data:', rawData);
        
        if (Array.isArray(rawData) && rawData.length > 0) {
            // Rack Type별로 그룹화하여 요약 데이터 생성
            const rackTypeGroups = {};
            
            rawData.forEach(item => {
                const rackType = item.RACK_TYPE || item.TYPE || 'Unknown';
                
                if (!rackTypeGroups[rackType]) {
                    rackTypeGroups[rackType] = {
                        total: 0,
                        occupied: 0,
                        available: 0,
                        totalProducts: 0
                    };
                }
                
                rackTypeGroups[rackType].total += 1;
                rackTypeGroups[rackType].totalProducts += (item.TOTAL_CNT || 0);
                
                if ((item.TOTAL_CNT || 0) >= 1) {
                    rackTypeGroups[rackType].occupied += 1;
                } else {
                    rackTypeGroups[rackType].available += 1;
                }
            });
            
            // 그룹화된 데이터를 배열로 변환
            return Object.keys(rackTypeGroups).map(type => {
                const group = rackTypeGroups[type];
                const utilization = group.total > 0 ? Math.round((group.occupied / group.total) * 100) : 0;
                
                return {
                    type,
                    total: group.total,
                    occupied: group.occupied,
                    available: group.available,
                    utilization
                };
            });
        }
        
        // 데이터가 없거나 배열이 아닌 경우 샘플 데이터 반환
        return [
            { type: 'A-Type', total: 120, occupied: 85, available: 35, utilization: 70.8 },
            { type: 'B-Type', total: 80, occupied: 62, available: 18, utilization: 77.5 },
            { type: 'C-Type', total: 60, occupied: 45, available: 15, utilization: 75.0 },
            { type: 'D-Type', total: 40, occupied: 28, available: 12, utilization: 70.0 }
        ];
    } catch (error) {
        console.error("Error fetching rack type summary:", error);
        // 샘플 데이터 반환
        return [
            { type: 'A-Type', total: 120, occupied: 85, available: 35, utilization: 70.8 },
            { type: 'B-Type', total: 80, occupied: 62, available: 18, utilization: 77.5 },
            { type: 'C-Type', total: 60, occupied: 45, available: 15, utilization: 75.0 },
            { type: 'D-Type', total: 40, occupied: 28, available: 12, utilization: 70.0 }
        ];
    }
};

// 실시간 모니터링 데이터 조회
export const getRealTimeMonitoring = async () => {
    try {
        const response = await axios.get(localapi + "rack/monitoring/realtime", {
            timeout: 5000,
            params: {
                udate: Date.now(),
            },
        });
        
        // 실제 데이터를 모니터링 형식에 맞게 변환
        const rawData = response.data;
        console.log('Raw monitoring data:', rawData);
        
        if (Array.isArray(rawData) && rawData.length > 0) {
            return rawData.map((item, index) => {
                // 제품 수량 정보
                const totalCount = item.TOTAL_CNT || 0;
                const normalCount = item.NORMAL_CNT || 0;
                const abnormalCount = item.ABNORMAL_CNT || 0;
                
                // 활용률 계산 (제품이 있으면 100%, 없으면 0%)
                const utilization = totalCount >= 1 ? 100 : 0;
                
                // 상태 결정 (정상 제품이 있으면 Normal, 비정상 제품만 있으면 Warning, 제품이 없으면 Available)
                let status = 'Available';
                if (totalCount > 0) {
                    if (abnormalCount > 0 && normalCount === 0) {
                        status = 'Warning';
                    } else if (abnormalCount > 0 && normalCount > 0) {
                        status = 'Warning';
                    } else {
                        status = 'Normal';
                    }
                }
                
                return {
                    id: index + 1,
                    rackId: item.BIN_LOC || item.RACK_ID || item.RACKID || `RACK-${String(index + 1).padStart(3, '0')}`,
                    rackType: item.CDNAME || item.RACK_TYPE || item.TYPE || 'Unknown',
                    targetMaterial: item.BIN_LOCATION_TARGET || item.TARGET_MATERIAL || 'N/A',
                    flag1: item.FLAG1 || 'N',
                    flag2: item.FLAG2 || 'N',
                    lastUpdate: formatDateTime(item.LAST_CHG_DT || item.LAST_UPDATE || item.UPDATE_TIME) || formatDateTime(new Date()),
                    productCount: totalCount,
                    normalCount,
                    abnormalCount,
                    temperature: item.TEMPERATURE || (20 + Math.random() * 10).toFixed(1),
                    humidity: item.HUMIDITY || (40 + Math.random() * 20).toFixed(1)
                };
            });
        }
        
        // 데이터가 없거나 배열이 아닌 경우 빈 배열 반환
        return [];
    } catch (error) {
        console.error("Error fetching real-time monitoring data:", error);
        // 에러 발생 시 빈 배열 반환
        return [];
    }
};

// 특정 Rack Type의 상세 정보 조회
export const getRackTypeDetails = async (rackType) => {
    try {
        const response = await axios.get(localapi + "rack/types/details", {
            timeout: 5000,
            params: {
                rackType,
                udate: Date.now(),
            },
        });
        return response.data;
    } catch (error) {
        console.error("Error fetching rack type details:", error);
        return [];
    }
};

// Rack 상태 업데이트
export const updateRackStatus = async (rackId, status) => {
    try {
        const response = await axios.post(localapi + "rack/status/update", {
            rackId,
            status,
            timestamp: new Date().toISOString()
        }, {
            timeout: 5000,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
            },
        });
        return response.data;
    } catch (error) {
        console.error("Error updating rack status:", error);
        throw error;
    }
};

// Rack 활용률 통계 조회
export const getRackUtilizationStats = async (period = 'daily') => {
    try {
        const response = await axios.get(localapi + "rack/utilization/stats", {
            timeout: 5000,
            params: {
                period,
                udate: Date.now(),
            },
        });
        return response.data;
    } catch (error) {
        console.error("Error fetching utilization stats:", error);
        return {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Utilization Rate',
                data: [65, 72, 68, 75, 80, 85, 73],
                borderColor: '#2196F3',
                backgroundColor: 'rgba(33, 150, 243, 0.1)',
                tension: 0.4
            }]
        };
    }
};

// 알림 및 경고 데이터 조회
export const getAlertsAndWarnings = async () => {
    try {
        const response = await axios.get(localapi + "rack/alerts/warnings", {
            timeout: 5000,
            params: {
                udate: Date.now(),
            },
        });
        
        // 실제 데이터를 알림 형식에 맞게 변환
        const rawData = response.data;
        console.log('Raw alerts data:', rawData);
        
        // 실제 데이터 구조에 따라 변환 로직 추가
        if (Array.isArray(rawData)) {
            return rawData.map((item, index) => ({
                id: item.ALERT_ID || item.ID || index + 1,
                type: item.ALERT_TYPE || item.TYPE || 'warning',
                message: item.ALERT_MESSAGE || item.MESSAGE || 'Unknown alert',
                timestamp: item.ALERT_TIME || item.TIMESTAMP || new Date().toISOString(),
                severity: item.SEVERITY || item.ALERT_SEVERITY || 'medium'
            }));
        }
        
        // 배열이 아닌 경우 샘플 데이터 반환
        return [
            {
                id: 1,
                type: 'warning',
                message: 'Rack A-045 utilization is above 90%',
                timestamp: new Date().toISOString(),
                severity: 'medium'
            },
            {
                id: 2,
                type: 'critical',
                message: 'Rack C-012 requires maintenance',
                timestamp: new Date().toISOString(),
                severity: 'high'
            }
        ];
    } catch (error) {
        console.error("Error fetching alerts and warnings:", error);
        return [
            {
                id: 1,
                type: 'warning',
                message: 'Rack A-045 utilization is above 90%',
                timestamp: new Date().toISOString(),
                severity: 'medium'
            },
            {
                id: 2,
                type: 'critical',
                message: 'Rack C-012 requires maintenance',
                timestamp: new Date().toISOString(),
                severity: 'high'
            }
        ];
    }
};

// 샘플 모니터링 데이터 생성 함수
const generateMockMonitoringData = () => {
    const data = [];
    const rackTypes = ['A-Type', 'B-Type', 'C-Type', 'D-Type'];
    const locations = ['1F', '2F', '3F', '4F', '5F'];

    for (let i = 0; i < 50; i++) {
        const rackType = rackTypes[Math.floor(Math.random() * rackTypes.length)];
        const location = locations[Math.floor(Math.random() * locations.length)];
        const totalCount = Math.floor(Math.random() * 50);
        const normalCount = Math.floor(Math.random() * totalCount);
        const abnormalCount = totalCount - normalCount;
        
        // 상태 결정
        let status = 'Available';
        if (totalCount > 0) {
            if (abnormalCount > 0 && normalCount === 0) {
                status = 'Warning';
            } else if (abnormalCount > 0 && normalCount > 0) {
                status = 'Warning';
            } else {
                status = 'Normal';
            }
        }
        
        data.push({
            id: i + 1,
            rackId: `BIN-${String(i + 1).padStart(3, '0')}`,
            rackType: rackType, // CDNAME 대신 샘플에서는 rackType 사용
            location: `${location}-${String.fromCharCode(65 + Math.floor(Math.random() * 10))}${Math.floor(Math.random() * 20) + 1}`,
            status,
            utilization: totalCount > 0 ? 100 : 0,
            lastUpdate: formatDateTime(new Date(Date.now() - Math.random() * 86400000)),
            productCount: totalCount,
            normalCount,
            abnormalCount,
            temperature: (20 + Math.random() * 10).toFixed(1),
            humidity: (40 + Math.random() * 20).toFixed(1)
        });
    }
    return data;
};

// Rack 상세 정보 조회 API
export const getRackDetail = async (rackId) => {
    try {
        const response = await fetch(`${localapi}rack/detail/${rackId}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const rawData = await response.json();
        console.log('Rack Detail Raw Data:', rawData);
        
        // 실제 데이터가 없으면 샘플 데이터 반환
        if (!rawData || rawData.length === 0) {
            return {
                rackInfo: {
                    rackId: rackId,
                    status: 'No Data',
                    capacity: 0,
                    occupied: 0,
                    temperature: 'N/A',
                    humidity: 'N/A',
                    lastUpdated: 'No Data Available'
                },
                inventoryItems: []
            };
        }
        
        // 실제 데이터 변환
        return transformRackDetailData(rawData, rackId);
    } catch (error) {
        console.error('Error fetching rack detail:', error);
        // 에러 발생 시 "No Data Available" 반환
        return {
            rackInfo: {
                rackId: rackId,
                status: 'No Data',
                capacity: 0,
                occupied: 0,
                temperature: 'N/A',
                humidity: 'N/A',
                lastUpdated: 'No Data Available'
            },
            inventoryItems: []
        };
    }
};

// 실제 데이터 변환 함수
const transformRackDetailData = (rawData, rackId) => {
    if (Array.isArray(rawData) && rawData.length > 0) {
        const firstItem = rawData[0];
        
        // Rack 정보
        const rackInfo = {
            rackId: rackId,
            status: 'Active',
            capacity: parseInt(firstItem.CDNAME?.charAt(0) || firstItem.RACK_TYPE?.charAt(0) || '1'), // 첫번째 글자를 숫자로 변환
            occupied: rawData.length, // Inventory items의 행수
            temperature: firstItem.TEMPERATURE || (20 + Math.random() * 10).toFixed(1),
            humidity: firstItem.HUMIDITY || (40 + Math.random() * 20).toFixed(1),
            lastUpdated: formatDateTime(Math.max(...rawData.map(item => new Date(item.PROD_DT || 0)).filter(date => !isNaN(date.getTime())))) || formatDateTime(new Date())
        };
        
        // 재고 아이템 정보
        const inventoryItems = rawData.map((item, index) => ({
            id: index + 1,
            lcCd: item.LC_CD || '',
            balanceWt: item.BALANCE_WT || 0,
            balanceLength: item.BALANCE_LENGTH || 0,
            prodGb: item.PROD_GB || '',
            prodDt: formatDateTime(item.PROD_DT) || '',
            machineDesc: item.MACHINE_DESC || '',
            material_cd: item.MATERIAL_CD  || '',
            orgMaterialDesc: item.ORG_MATERIAL_DESC || ''
        }));
        
        return {
            rackInfo,
            inventoryItems
        };
    }
    
    return generateMockRackDetail(rackId);
};

// 샘플 Rack 상세 데이터 생성 함수
const generateMockRackDetail = (rackId) => {
    const rackInfo = {
        rackId: rackId,
        status: 'Active',
        capacity: 7, // 첫번째 글자 '7'
        occupied: 3, // Inventory items의 행수
        temperature: (20 + Math.random() * 10).toFixed(1),
        humidity: (40 + Math.random() * 20).toFixed(1),
        lastUpdated: formatDateTime(new Date('2024-01-17')) // Production Date 중 가장 큰 값
    };
    
    const inventoryItems = [
        {
            id: 1,
            lcCd: 'LC001',
            balanceWt: 150.5,
            balanceLength: 1000,
            prodGb: 'A',
            prodDt: formatDateTime(new Date('2024-01-15')),
            machineDesc: 'Wire Drawing Machine A',
            orgMaterialDesc: 'Copper Wire Type A'
        },
        {
            id: 2,
            lcCd: 'LC002',
            balanceWt: 200.0,
            balanceLength: 1200,
            prodGb: 'B',
            prodDt: formatDateTime(new Date('2024-01-16')),
            machineDesc: 'Wire Drawing Machine B',
            orgMaterialDesc: 'Copper Wire Type B'
        },
        {
            id: 3,
            lcCd: 'LC003',
            balanceWt: 175.8,
            balanceLength: 1100,
            prodGb: 'C',
            prodDt: formatDateTime(new Date('2024-01-17')),
            machineDesc: 'Wire Drawing Machine C',
            orgMaterialDesc: 'Copper Wire Type C'
        }
    ];
    
    return {
        rackInfo,
        inventoryItems
    };
};

// WebSocket 연결을 위한 함수 (실시간 업데이트용)
export const createWebSocketConnection = (onMessage) => {
    try {
        const ws = new WebSocket('ws://localhost:3222/rack/ws');
        
        ws.onopen = () => {
            console.log('WebSocket connection established');
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            onMessage(data);
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
        
        ws.onclose = () => {
            console.log('WebSocket connection closed');
        };
        
        return ws;
    } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        return null;
    }
};

// 데이터 내보내기 (Excel, CSV 등)
export const exportRackData = async (format = 'excel', filters = {}) => {
    try {
        const response = await axios.post(localapi + "rack/export", {
            format,
            filters,
            timestamp: new Date().toISOString()
        }, {
            timeout: 10000,
            headers: {
                "Content-Type": "application/json;charset=utf-8",
            },
            responseType: 'blob'
        });
        return response.data;
    } catch (error) {
        console.error("Error exporting rack data:", error);
        throw error;
    }
}; 

// 비정상 데이터 조회 (USP_SFC_KBAS090_PRINT_R10_M_ABNORMAL)
export const getAbnormalData = async () => {
    try {
        const response = await axios.get(localapi + "rack/abnormal/data", {
            timeout: 5000,
            params: {
                udate: Date.now(),
            },
        });
        
        const rawData = response.data;
        console.log('Raw abnormal data:', rawData);
        
        if (Array.isArray(rawData) && rawData.length > 0) {
            // BLOCK_MEMO 기준으로 그룹화하여 수량 계산
            const abnormalCounts = rawData.reduce((acc, item) => {
                const blockMemo = item.BLOCK_MEMO || 'Unknown';
                acc[blockMemo] = (acc[blockMemo] || 0) + 1;
                return acc;
            }, {});
            
            // 차트 데이터 형식으로 변환
            const chartData = {
                labels: Object.keys(abnormalCounts),
                datasets: [{
                    label: 'Abnormal Count',
                    data: Object.values(abnormalCounts),
                    backgroundColor: [
                        '#FF6384',
                        '#36A2EB', 
                        '#FFCE56',
                        '#4BC0C0',
                        '#9966FF',
                        '#FF9F40',
                        '#FF6384',
                        '#C9CBCF'
                    ],
                    borderColor: [
                        '#FF6384',
                        '#36A2EB',
                        '#FFCE56', 
                        '#4BC0C0',
                        '#9966FF',
                        '#FF9F40',
                        '#FF6384',
                        '#C9CBCF'
                    ],
                    borderWidth: 1
                }]
            };
            
            return chartData;
        }
        
        // 데이터가 없거나 배열이 아닌 경우 "No Data Available" 반환
        return {
            labels: ['No Data Available'],
            datasets: [{
                label: 'Abnormal Count',
                data: [0],
                backgroundColor: ['#E0E0E0'],
                borderColor: ['#BDBDBD'],
                borderWidth: 1
            }]
        };
    } catch (error) {
        console.error("Error fetching abnormal data:", error);
        // 에러 발생 시에도 "No Data Available" 반환
        return {
            labels: ['No Data Available'],
            datasets: [{
                label: 'Abnormal Count',
                data: [0],
                backgroundColor: ['#E0E0E0'],
                borderColor: ['#BDBDBD'],
                borderWidth: 1
            }]
        };
    }
};

// 상세 랙 모니터링 데이터 조회 (USP_SFC_KBAS090_PRINT_R10_M_DETAIL)
export const getDetailedRackMonitoring = async () => {
    try {
        const response = await axios.get(localapi + "rack/monitoring/detail", {
            timeout: 5000,
            params: {
                udate: Date.now(),
            },
        });
        
        const rawData = response.data;
        console.log('Raw detailed monitoring data:', rawData);
        
        if (Array.isArray(rawData) && rawData.length > 0) {
            return rawData.map((item, index) => ({
                id: index + 1,
                cdname: item.CDNAME || '',
                binLoc: item.BIN_LOC || '',
                binLocationTarget: item.BIN_LOCATION_TARGET || '',
                refMaterialStdLength: item.REF_MATERIAL_STD_LENGTH || '',
                materialCd: item.MATERIAL_CD || '',
                materialDesc: item.MATERIAL_DESC || '',
                balanceLength: item.BALANCE_LENGTH || '',
                prodGb: item.PROD_GB || '',
                lastChgDt: formatDateTime(item.LAST_CHG_DT),
                flag1: item.FLAG1 || 'N',
                flag2: item.FLAG2 || 'N',
                lenRate: item.LEN_RATE || ''
            }));
        }
        
        // 데이터가 없거나 배열이 아닌 경우 샘플 데이터 반환
        return generateMockDetailedData();
    } catch (error) {
        console.error("Error fetching detailed monitoring data:", error);
        // 샘플 데이터 반환
        return generateMockDetailedData();
    }
};

// 샘플 상세 모니터링 데이터 생성 함수
const generateMockDetailedData = () => {
    const data = [];
    const rackTypes = ['7 Rack', '5 Rack', '1 Rack', 'RW-B'];
    const materials = ['G200', 'U200', 'G240', 'U240'];
    
    for (let i = 0; i < 50; i++) {
        const rackType = rackTypes[Math.floor(Math.random() * rackTypes.length)];
        const material = materials[Math.floor(Math.random() * materials.length)];
        
        data.push({
            id: i + 1,
            cdname: rackType,
            binLoc: `${rackType.charAt(0)}${String(i + 1).padStart(4, '0')}`,
            binLocationTarget: `${material}, ${(0.3 + Math.random() * 0.7).toFixed(2)}`,
            refMaterialStdLength: `${Math.floor(Math.random() * 1000) + 500}`,
            materialCd: `MAT${String(i + 1).padStart(6, '0')}`,
            materialDesc: `${material} Material ${i + 1}`,
            balanceLength: `${Math.floor(Math.random() * 500) + 100}`,
            prodGb: `GB${String(i + 1).padStart(3, '0')}`,
            lastChgDt: formatDateTime(new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)),
            flag1: Math.random() > 0.8 ? 'Y' : 'N',
            flag2: Math.random() > 0.7 ? 'Y' : 'N',
            lenRate: `${(Math.random() * 100).toFixed(2)}%`
        });
    }
    
    return data;
}; 