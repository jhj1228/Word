const { Client } = require('pg');
const axios = require('axios');

// --- 설정 부분 ---
const DB_CONFIG = {
    user: 'your_username',
    host: 'your_host',
    database: 'your_database',
    password: 'your_password',
    port: 5432,
};

const API_KEY_ST = 'your_api_key_here';
const API_URL_ST = 'https://stdict.korean.go.kr/api/search.do';

const API_KEY_OURMAL = 'your_api_key_here';
const API_URL_OURMAL = 'https://opendict.korean.go.kr/api/search';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function cleanWord(text) {
    if (!text) return "";
    return text.replace(/[^가-힣]/g, '');
}

function formatSubDefinitions(text) {
    if (!text) return "";
    let formatted = text.trim();
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

function processResultData(items) {
    if (!items || items.length === 0) return null;
    const formattedItems = items.map((item, index) => {
        const topIndex = index + 1;
        const rawDefinition = (item.sense && item.sense.definition) ? item.sense.definition : "";
        const subDefinition = formatSubDefinitions(rawDefinition);
        return `＂${topIndex}＂［1］${subDefinition}`;
    });
    return formattedItems.join('');
}

async function fetchFromApi(word, apiKey, apiUrl, method, apiName) {
    const searchWord = cleanWord(word);
    try {
        const params = {
            key: apiKey,
            q: searchWord,
            req_type: 'json',
            advanced: 'y',
            method: method,
            target: 1,
            type1: 'word',
            num: 100
        };

        const response = await axios.get(apiUrl, { params: params, timeout: 5000 });

        if (response.status === 200 && response.data && response.data.channel) {
            const items = response.data.channel.item;
            if (!items || items.length === 0) return null;

            const targetClean = cleanWord(word);
            const matchedItems = items.filter(item => cleanWord(item.word) === targetClean);

            if (matchedItems.length > 0) {
                return processResultData(matchedItems);
            }
        }
    } catch (e) {
    }
    return null;
}

async function getDefinition(word) {
    let result = null;

    // 표국대
    result = await fetchFromApi(word, API_KEY_ST, API_URL_ST, 'exact', '표국대-Exact');
    if (result) return result;

    result = await fetchFromApi(word, API_KEY_ST, API_URL_ST, 'include', '표국대-Include');
    if (result) return result;

    // 우리말샘
    result = await fetchFromApi(word, API_KEY_OURMAL, API_URL_OURMAL, 'exact', '우리말샘-Exact');
    if (result) return result;

    result = await fetchFromApi(word, API_KEY_OURMAL, API_URL_OURMAL, 'include', '우리말샘-Include');
    if (result) return result;

    return null;
}

async function updateDatabase() {
    const client = new Client(DB_CONFIG);
    try {
        await client.connect();
        console.log("데이터베이스 연결됨");
        const selectQuery = `
            SELECT _id 
            FROM public.kkutu_ko 
            WHERE (mean IS NULL OR mean = '' OR mean = '＂1＂［1］（1）')
              AND type != 'INJEONG'
            ORDER BY RANDOM()
        `;

        const res = await client.query(selectQuery);
        const words = res.rows;
        const total = words.length;

        console.log(`총 ${total}개의 '뜻 없는' 단어 작업을 시작합니다. (무작위 순서)`);

        let successCount = 0;
        for (let i = 0; i < total; i++) {
            const word = words[i]._id;
            const definition = await getDefinition(word);

            if (definition) {
                const updateQuery = "UPDATE public.kkutu_ko SET mean = $1 WHERE _id = $2";
                await client.query(updateQuery, [definition, word]);
                successCount++;
                console.log(`[${i + 1}/${total}] 성공: '${word}'`);
            } else {
                // console.log(`[${i + 1}/${total}] 실패: '${word}' (검색 결과 없음)`);
            }

            // 딜레이
            await delay(150);
        }
        console.log(`작업 완료. ${successCount}개 업데이트됨.`);

    } catch (err) {
        console.error("DB 오류:", err);
    } finally {
        await client.end();
    }
}

updateDatabase();