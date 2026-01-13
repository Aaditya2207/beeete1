// async function askGemini(question) {
//   try {
//     const url = `https://beebhangbhosda.vercel.app/?query=${encodeURIComponent(question)}`;
//     // const url = `http://localhost:3000/?query=${encodeURIComponent(question)}`;
//     const response = await fetch(url);
//     return await response.json();
//   } catch (error) {
   
//     console.error("API Error:", error);
//   }
// }
// askGemini("Generate code foe basic fetch with error handling").then((data) => console.log(data.code))







fetch(`https://beebhangbhosda.vercel.app/?query=${encodeURIComponent("Generate a simple express server")}`)
.then(data => data.json()).then(data => console.log(data.code))