const { Pool } = require('pg');
const fs = require('fs');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const { pick } = require('stream-json/filters/Pick');
const { chain } = require('stream-chain');

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
        if (obj.definition) results.push(obj.definition);

        const keysToCheck = ['word_info', 'wordinfo', 'sense_info', 'senseinfo', 'pos_info', 'comm_pattern_info'];

        Object.keys(obj).forEach(key => {
            if (typeof obj[key] === 'object' || keysToCheck.includes(key)) {
                extractDefinitions(obj[key], results);
            }
        });
    }
    return results;
}

function processSingleItem(item, existingWordSet) {
    let rawWord = "";

    if (item.wordinfo && item.wordinfo.word) rawWord = item.wordinfo.word;
    else if (item.word_info && item.word_info.word) rawWord = item.word_info.word;
    else if (item.word) rawWord = item.word;

    if (!rawWord) return null;

    const cleanKey = cleanWord(rawWord);
    if (!cleanKey) return null;
    if (!existingWordSet.has(cleanKey)) return null;

    const definitions = extractDefinitions(item);
    if (definitions.length === 0) return null;

    const uniqueDefs = [];
    definitions.forEach(def => {
        const formatted = formatSubDefinitions(def);
        if (!uniqueDefs.includes(formatted)) uniqueDefs.push(formatted);
    });

    if (uniqueDefs.length === 0) return null;

    const combinedMean = uniqueDefs.map((def, idx) => {
        const topIndex = idx + 1;
        return `＂${topIndex}＂［1］${def}`;
    }).join('');

    return { id: cleanKey, mean: combinedMean };
}

async function runUpdateSecure() {
    if (!fs.existsSync(JSON_FILE_PATH)) {
        console.error(`파일 없음: ${JSON_FILE_PATH}`);
        return;
    }

    const pool = new Pool(DB_CONFIG);

    try {
        console.log("1. DB 연결 및 기존 단어 목록 로드 중...");
        const res = await pool.query("SELECT _id FROM public.kkutu_ko");
        const existingWordSet = new Set();
        res.rows.forEach(row => existingWordSet.add(row._id));
        console.log(`DB 단어 목록 로드 완료: ${existingWordSet.size}개`);

        console.log("2. JSON 스트리밍 파싱 시작...");

        const pipeline = chain([
            fs.createReadStream(JSON_FILE_PATH),
            parser(),
            pick({ filter: 'channel.item' }),
            streamArray()
        ]);

        let batch = [];
        let successCount = 0;
        let scannedCount = 0;

        for await (const { value: item } of pipeline) {
            scannedCount++;

            const result = processSingleItem(item, existingWordSet);
            if (result) {
                batch.push(result);
            }

            if (batch.length >= BATCH_SIZE) {
                await executeBulkUpdate(pool, batch);
                successCount += batch.length;

                if (successCount % 5000 === 0) {
                    console.log(`[진행중] 확인된 항목: ${scannedCount}, 업데이트 성공: ${successCount}`);
                }
                batch = [];
            }
        }

        if (batch.length > 0) {
            await executeBulkUpdate(pool, batch);
            successCount += batch.length;
        }

        console.log(`\n모든 작업 완료! 총 ${successCount}개의 단어 뜻이 업데이트되었습니다.`);
        console.log(`(총 스캔한 JSON 항목 수: ${scannedCount})`);

    } catch (err) {
        if (err.message.includes('Filter not found')) {
            console.error("오류: JSON 구조가 'channel.item'이 아닙니다. 파일 내용을 확인하세요.");
        } else {
            console.error("오류 발생:", err);
        }
    } finally {
        await pool.end();
    }
}

async function executeBulkUpdate(pool, batch) {
    if (batch.length === 0) return;

    const valuesClause = batch.map((_, idx) => `($${idx * 2 + 1}, $${idx * 2 + 2})`).join(', ');
    const queryValues = [];
    batch.forEach(item => {
        queryValues.push(item.id);
        queryValues.push(item.mean);
    });

    const query = `
        UPDATE public.kkutu_ko AS t
        SET mean = v.mean
        FROM (VALUES ${valuesClause}) AS v(id, mean)
        WHERE t._id = v.id
    `;

    try {
        await pool.query(query, queryValues);
    } catch (e) {
        console.error("DB 업데이트 중 오류:", e.message);
    }
}

runUpdateSecure();
