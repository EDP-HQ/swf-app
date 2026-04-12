import axios from "axios";
// import { error } from "console";

const localapi = "http://194.1.31.11:3222/";
//const localapi = "http://localhost:3222/";

export const postExcelData = async (data) => {
  try {
    const response = await axios.post(localapi + "tag/regist", data, {
      headers: {
        "Content-Type": "application/json;charset=utf-8",  // Set the appropriate content type
      },
      params: {
        udate: Date.now(),
      },
    });
    console.log("Data successfully sent:", response.data);
  } catch (error) {
    console.error("Error sending data:", error);
  }
};

export const bindImage = async (data) => {
    try {
      const response = await axios.post(localapi + "batchBind/image", data, {
        headers: {
          "Content-Type": "application/json;charset=utf-8",  // Set the appropriate content type
        },
        params: {
          udate: Date.now(),
        },
      });
      console.log("Data successfully sent:", response.data);
    } catch (error) {
      console.error("Error sending data:", error);
    }
  };

//D1 RACK 초기화 (전체 조회 및 재전송)
  export async function esl_d1binsearch_ini(params) {
    console.log ('esl_SearchBin_ini',params)
   try {
     const res = await axios.get(localapi + "esl/d1binsearch_ini", {
       timeout: 5000,
       params: {
         udate: Date.now(),
         ...params
       },
     });
     return res;
 
   } catch (error) {
     // Handle other errors
     throw error;
   }
 };
//D1 RACK OPEN 목록 조회
 export async function esl_d1binsearch_open(params) {
  console.log ('esl_SearchBin_open',params)
 try {
   const res = await axios.get(localapi + "esl/d1binsearch_open", {
     timeout: 5000,
     params: {
       udate: Date.now(),
       ...params
     },
   });
   return res;

 } catch (error) {
   // Handle other errors
   throw error;
 }
};
//D1 RACK CLOSE 처리
export async function esl_d1binsearch_close(params) {
  //console.log ('esl_d1Search',params)
 try {
   const res = await axios.get(localapi + "esl/d1binsearch_close", {
     timeout: 5000,
     params: {
       udate: Date.now(),
       ...params
     },
   });

    //console.log("res");
   return res;

 } catch (error) {
   // Handle other errors
   throw error;
 }
};
//D1 RACK 상세 조회
export async function esl_d1Search(params) {
    //console.log ('esl_d1Search',params)
   try {
     const res = await axios.get(localapi + "esl/d1search", {
       timeout: 5000,
       params: {
         udate: Date.now(),
         ...params
       },
     });
 
      //console.log("res");
     return res;
 
   } catch (error) {
     // Handle other errors
     throw error;
   }
};
 // PNG 파일로 변환 후 저장
 export async function pngUpload(blob, filename) {
   const formData = new FormData();
   formData.append('file', blob, filename); // Note the filename parameter here
 
   try {
     const response = await axios.post(localapi + 'upload/png', formData, {
       headers: {
         'Content-Type': 'multipart/form-data',
       },
     });
 
     if (response.status === 200) {
       console.log('File uploaded successfully');
       // console.log('message', response)
       return { success: true, message: response };
       // You can perform additional actions after a successful upload
     } else {
       throw new Error('File upload failed');
     }
   } catch (error) {
     console.error('Error during file upload:', error);
     return { success: false, message: error };
   }
 }
 // ESL OPEN 목록 조회
 export async function esl_opensearch(params) {
  //console.log ('esl_SearchBin',params)
 try {
   const res = await axios.get(localapi + "esl/opensearch", {
     timeout: 5000,
     params: {
       udate: Date.now(),
       ...params
     },
   });
   return res;

 } catch (error) {
   // Handle other errors
   throw error;
 }
}
// ESL 상세 조회
export async function esl_inventorySearch(params) {
  console.log ('esl_inventorySearch',params)
 try {
   const res = await axios.get(localapi + "esl/inventorysearch", {
     timeout: 5000,
     params: {
       udate: Date.now(),
       ...params
     },
   });

   console.log("res");
   return res;

 } catch (error) {
   // Handle other errors
   throw error;
 }
}