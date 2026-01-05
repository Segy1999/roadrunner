const response = await fetch("https://api.skills.browser-use.com/skill/1c79a6b4-5d26-456e-96c3-87c23f63a313/execute", {
    method: "POST",
    headers: {
        "Content-Type": "application/json",
    },
    body: JSON.stringify({
        "parameters": {
            "locale": "en-ca",
            "service_id": "SI120",
            "model_id": "",
            "include_prices": "true",
        }
    }),
});

const data = await response.json();
console.log(JSON.stringify(data, null, 2));