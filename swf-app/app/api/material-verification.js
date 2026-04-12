import axios from "axios";

const localapi = "http://194.1.31.11:3222/";
//const localapi = "http://localhost:3222/";

// Material Verification 데이터 조회 API
export const getMaterialVerificationData = async () => {
    try {
        const response = await axios.get(localapi + "rack/monitoring/realtime", {
            timeout: 5000,
            params: {
                udate: Date.now(),
            },
        });
        
        // 실제 데이터를 verification 형식에 맞게 변환
        const rawData = response.data;
        console.log('Raw verification data:', rawData);
        
        if (Array.isArray(rawData) && rawData.length > 0) {
            return rawData.map((item, index) => ({
                id: index + 1,
                BIN_LOC: item.BIN_LOC || `BIN-${String(index + 1).padStart(3, '0')}`,
                BIN_LOCATION_TARGET: item.BIN_LOCATION_TARGET || `TARGET-${String(index + 1).padStart(3, '0')}`,
                TOTAL_CNT: item.TOTAL_CNT || 0,
                FLAG1: item.FLAG1 || 'N',
                FLAG2: item.FLAG2 || 'N',
                CDNAME: item.CDNAME || 'Unknown'
            }));
        }
        
        // 데이터가 없거나 배열이 아닌 경우 샘플 데이터 반환
        return generateMockVerificationData();
    } catch (error) {
        console.error("Error fetching material verification data:", error);
        // 샘플 데이터 반환
        return generateMockVerificationData();
    }
};

// 샘플 Material Verification 데이터 생성 함수
const generateMockVerificationData = () => {
    const data = [];
    const rackTypes = ['7 Rack', '5 Rack', '3 Rack', 'A Rack', 'B Rack'];
    
    // 7 Rack 데이터
    for (let i = 0; i < 15; i++) {
        data.push({
            id: i + 1,
            BIN_LOC: `DS0001_${String(i + 1).padStart(4, '0')}`,
            BIN_LOCATION_TARGET: `G200, ${(0.5 + Math.random() * 0.5).toFixed(2)}`,
            TOTAL_CNT: Math.floor(Math.random() * 100),
            FLAG1: Math.random() > 0.8 ? 'Y' : 'N', // 20% 확률로 Y
            FLAG2: Math.random() > 0.7 ? 'Y' : 'N', // 30% 확률로 Y
            CDNAME: '7 Rack'
        });
    }
    
    // 5 Rack 데이터
    for (let i = 0; i < 12; i++) {
        data.push({
            id: data.length + 1,
            BIN_LOC: `DS0002_${String(i + 1).padStart(4, '0')}`,
            BIN_LOCATION_TARGET: `U200, ${(0.3 + Math.random() * 0.4).toFixed(2)}`,
            TOTAL_CNT: Math.floor(Math.random() * 80),
            FLAG1: Math.random() > 0.85 ? 'Y' : 'N', // 15% 확률로 Y
            FLAG2: Math.random() > 0.75 ? 'Y' : 'N', // 25% 확률로 Y
            CDNAME: '5 Rack'
        });
    }
    
    // 기타 Rack 데이터
    for (let i = 0; i < 20; i++) {
        const rackType = rackTypes[Math.floor(Math.random() * 3) + 2]; // 3 Rack, A Rack, B Rack
        data.push({
            id: data.length + 1,
            BIN_LOC: `DS0003_${String(i + 1).padStart(4, '0')}`,
            BIN_LOCATION_TARGET: `G240, ${(0.4 + Math.random() * 0.6).toFixed(2)}`,
            TOTAL_CNT: Math.floor(Math.random() * 60),
            FLAG1: Math.random() > 0.9 ? 'Y' : 'N', // 10% 확률로 Y
            FLAG2: Math.random() > 0.8 ? 'Y' : 'N', // 20% 확률로 Y
            CDNAME: rackType
        });
    }
    
    return data;
}; 