const fs = require('fs');

const logPath = 'C:\\Users\\admin\\.gemini\\antigravity\\brain\\bce1e1b2-363f-4c85-bc32-cdaf3511efa7\\.system_generated\\logs\\overview.txt';
const content = fs.readFileSync(logPath, 'utf8');

const lines = content.split('\n');
let fullText = '';
for (let line of lines) {
  if (line.includes('"step_index":31') || line.includes('"step_index":88')) {
    const data = JSON.parse(line);
    fullText += data.content + '\n=================\n';
  }
}

fs.writeFileSync('c:\\study\\trongbeshop\\trongbeshop\\scratch\\user_prompt_31.txt', fullText, 'utf8');
console.log('Done');
