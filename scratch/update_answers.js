const fs = require('fs');

const dataFile = 'c:\\study\\trongbeshop\\trongbeshop\\js\\data.js';
let content = fs.readFileSync(dataFile, 'utf8');

const correctIndices = {
  q1: 3, q2: 1, q3: 3, q4: 1, q5: 3, q6: 1, q7: 3, q8: 0, q9: 1, q10: 1,
  q11: 0, q12: 2, q13: 0, q14: 1, q15: 2, q16: 3, q17: 1, q18: 0, q19: 2, q20: 3,
  q21: 3, q22: 1, q23: 1, q24: 0, q25: 3, q26: 0, q27: 2, q28: 2, q29: 3, q30: 2,
  q31: 2, q32: 1, q33: 0, q34: 3, q35: 1, q36: 2, q37: 1, q38: 0, q39: 0, q40: 1,
  q41: 2, q42: 3, q43: 0, q44: 2, q45: 1, q46: 0, q47: 2, q48: 2, q49: 1, q50: 2,
  q51: 0, q52: 1, q53: 1, q54: 3, q55: 1, q56: 3, q57: 0, q58: 2, q59: 0, q60: 2,
  q61: 1, q62: 2, q63: 1, q64: 3, q65: 3, q66: 0, q67: 0, q68: 2, q69: 0, q70: 1,
  q71: 1, q72: 3, q73: 0, q74: 2, q75: 1, q76: 2, q77: 1, q78: 0, q79: 1, q80: 3,
  q81: 3, q82: 0, q83: 2, q84: 1, q85: 0, q86: 3, q87: 2, q88: 1, q89: 0, q90: 2,
  q91: 2, q92: 1, q93: 3, q94: 2, q95: 2, q96: 0, q97: 2, q98: 2, q99: 1, q100: 2,
  q101: 2, q102: 0, q103: 2, q104: 3, q105: 3, q106: 0, q107: 0, q108: 0, q109: 3, q110: 2,
  q111: 0, q112: 0, q113: 3, q114: 0, q115: 0, q116: 0, q117: 1, q118: 1, q119: 2, q120: 0
};

// We will use regex to find each { id: "qX", ..., correctIndex: Y } and replace Y with the correct index.
// This is safe because data.js has predictable structure.

for (let i = 1; i <= 120; i++) {
  const qId = `q${i}`;
  if (correctIndices[qId] !== undefined) {
    const newIdx = correctIndices[qId];
    // Regex to match: id: "qX", ... correctIndex: Y }
    // Note: there might be line breaks or specific formatting
    const regex = new RegExp(`({[^}]*id:\\s*"${qId}"[^}]*correctIndex:\\s*)(\\d+)(\\s*})`, "g");
    content = content.replace(regex, `$1${newIdx}$3`);
  }
}

fs.writeFileSync(dataFile, content, 'utf8');
console.log("Updated data.js with correct answers");
