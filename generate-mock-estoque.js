import fs from 'fs';

function parseMesAno(mesStr) {
    const [a, m] = mesStr.split('_');
    return { ano: parseInt(a, 10), mes: parseInt(m, 10) };
}

function diasNoMes(ano, mes) {
    return new Date(ano, mes, 0).getDate();
}

const rawData = fs.readFileSync('c:/Users/Fernando/OneDrive/Documentos/Projetos GitHub/planejamento-compras-app/client/public/sample-data.json', 'utf8');
const data = JSON.parse(rawData);

const meses = data.metadata.meses;
const cadastroMap = new Map();
data.cadastro.forEach(c => cadastroMap.set(c.CHAVE, c));

const estoquesObjetivo = [];

data.projecao.forEach(proj => {
    const cad = cadastroMap.get(proj.CHAVE);
    if (!cad) return;

    const lt = cad.LT || 0;
    const frequencia = cad.FREQUENCIA || 0;
    const estSeguranca = cad.EST_SEGURANCA || 0;
    const impacto = cad.IMPACTO || 0;

    const mesesObj = {};

    meses.forEach(mes => {
        const mesData = proj.meses[mes];
        const sellOut = mesData ? (mesData.SELL_OUT || 0) : 0;
        
        const { ano, mes: mesNum } = parseMesAno(mes);
        const diasReais = diasNoMes(ano, mesNum);
        const demandaMedia = sellOut / diasReais;
        
        let estObj = demandaMedia * (lt + frequencia + estSeguranca) + impacto;
        // round
        mesesObj[mes] = Math.round(estObj);
        
        // Let's add an artificial hardcoded test value on the first element so the user can easily verify the value comes from the JSON DB
        // The UI currently shows Mar 2026 as its first column due to the current date limit (March 15th 2026).
        if (proj.CHAVE === '1-2959' && mes === '2026_03') {
             mesesObj[mes] = 99999;
        }
    });

    estoquesObjetivo.push({
        chave: proj.CHAVE,
        meses: mesesObj
    });
});

fs.writeFileSync('c:/Users/Fernando/OneDrive/Documentos/Projetos GitHub/planejamento-compras-app/client/public/estoque-objetivo.json', JSON.stringify(estoquesObjetivo, null, 2));
console.log('Successfully generated estoque-objetivo.json');
