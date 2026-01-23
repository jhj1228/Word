const { Pool } = require('pg');
const fs = require('fs');

const DB_CONFIG = {
    user: 'your_user',
    host: 'your_host',
    database: 'your_database',
    password: 'your_password',
    port: 5432,
    max: 20,
};

const JSON_FILE_PATH = 'your_file_path';

const BATCH_SIZE = 1000;

function cleanWord(text) {
    if (!text) return "";
    return text.replace(/[^가-힣]/g, '');
}

function formatSubDefinitions(text) {
    if (!text) return "";
    let formatted = text.trim();
    formatted = formatted.replace(/[\u0000-\u001F]/g, '');
    const circledMap = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5, '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10 };
    for (const [char, num] of Object.entries(circledMap)) {
        formatted = formatted.split(char).join(`（${num}）`);
    }
    formatted = formatted.replace(/(^|\s)(\d+)\./g, '$1（$2）');
    if (!formatted.match(/^\s*（\d+）/)) {
        formatted = `（1）${formatted}`;
    }
    return formatted;
}

function extractDefinitions(obj, results = []) {
    if (!obj) return results;
    if (Array.isArray(obj)) {
        obj.forEach(item => extractDefinitions(item, results));
    } else if (typeof obj === 'object') {
        if (obj.definition) {
            results.push(obj.definition);
        }
        Object.values(obj).forEach(value => {
            if (typeof value === 'object') {
                extractDefinitions(value, results);
            }
        });
    }
    return results;
}

function processJsonData(jsonData) {
    console.log("데이터 구조 분석 및 가공 중...");
    let items = [];
    if (Array.isArray(jsonData)) items = jsonData;
    else if (jsonData.channel && Array.isArray(jsonData.channel.item)) items = jsonData.channel.item;
    else {
        console.error("데이터 배열을 찾을 수 없습니다.");
        return [];
    }

    const wordMap = new Map();

    items.forEach((item) => {
        let rawWord = "";
        if (item.word_info && item.word_info.word) rawWord = item.word_info.word;
        else if (item.word) rawWord = item.word;

        if (!rawWord) return;

        const cleanKey = cleanWord(rawWord);
        if (!cleanKey) return;

        const definitions = extractDefinitions(item.word_info);
        if (definitions.length === 0) return;

        if (!wordMap.has(cleanKey)) {
            wordMap.set(cleanKey, []);
        }

        definitions.forEach(def => {
            const formatted = formatSubDefinitions(def);
            if (!wordMap.get(cleanKey).includes(formatted)) {
                wordMap.get(cleanKey).push(formatted);
            }
        });
    });

    const resultList = [];
    for (const [word, definitions] of wordMap) {
        const combinedMean = definitions.map((def, idx) => {
            const topIndex = idx + 1;
            return `＂${topIndex}＂［1］${def}`;
        }).join('');

        resultList.push({
            id: word,
            mean: combinedMean
        });
    }

    console.log(`중복 제거 후 ${resultList.length}개의 단어 준비 완료.`);
    return resultList;
}

async function insertDataToDb() {
    if (!fs.existsSync(JSON_FILE_PATH)) {
        console.error(`파일 없음: ${JSON_FILE_PATH}`);
        return;
    }

    const pool = new Pool(DB_CONFIG);

    try {
        console.log(`JSON 파일 읽는 중...`);
        const rawData = fs.readFileSync(JSON_FILE_PATH, 'utf8');
        const jsonData = JSON.parse(rawData);

        const processedList = processJsonData(jsonData);

        if (processedList.length === 0) {
            console.log("저장할 데이터가 없습니다.");
            return;
        }

        console.log(`DB 입력 시작 (총 ${processedList.length}개)...`);

        let successCount = 0;

        for (let i = 0; i < processedList.length; i += BATCH_SIZE) {
            const batch = processedList.slice(i, i + BATCH_SIZE);

            const query = `
                INSERT INTO public.kkutu_ko (_id, mean, type)
                VALUES 
                ${batch.map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2}, 'DQ')`).join(', ')}
                ON CONFLICT (_id) 
                DO UPDATE SET mean = EXCLUDED.mean
            `;

            const values = [];
            batch.forEach(item => {
                values.push(item.id);
                values.push(item.mean);
            });

            await pool.query(query, values);

            successCount += batch.length;

            if (i === 0 || i % (BATCH_SIZE * 5) === 0) {
                const percent = ((successCount / processedList.length) * 100).toFixed(1);
                console.log(`진행률: ${percent}% (${successCount}/${processedList.length})`);
            }
        }

        console.log(`\n작업 완료! 총 ${successCount}개 처리됨.`);

    } catch (err) {
        console.error("오류 발생:", err);
    } finally {
        await pool.end();
    }
}

insertDataToDb();
