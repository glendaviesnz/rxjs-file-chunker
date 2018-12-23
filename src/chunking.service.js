import { Subject, Observable, combineLatest, of } from 'rxjs';
import { 
    mergeMap, 
    filter, 
    map, 
    tap, 
    take, 
    publish, 
    toArray, 
    catchError, 
    distinctUntilChanged 
} from 'rxjs/operators';
import * as CryptoJS from 'crypto-js';

import { httpUpload } from './http-observable';

const chunkSize = 1024 * 1024;
const chunkQueue$ = new Subject();
const maxConnections = 3;

// this is where the magic happens a queue of document chunk uploads that limits the number of 
// concurrent uploads - in just 3 lines of code - got to love RxJs!
chunkQueue$
    .pipe(mergeMap((data) => data, null, maxConnections))
    .subscribe();

export function uploadFile(file) {
    const fileData = { file };
    const chunkSizes = calculateChunks(fileData.file.size, chunkSize);
    fileData.chunkSizes = chunkSizes;
    const getChunks$ = getChunks(fileData);
    const chunkArray$ = getChunks$.pipe(toArray());
    const checkSum$ = calculateCheckSum(chunkArray$);
    const progress$ = new Subject().pipe(distinctUntilChanged());
    startChunkUpload(chunkArray$, checkSum$, progress$);

    getChunks$.connect();
    return progress$
}

function calculateChunks(fileSize, chunkSize) {
    const chunkSizes = [];
    const numberOfChunks = Math.max(Math.ceil(fileSize / chunkSize), 1);
    for (let offset = 0; offset < numberOfChunks; offset++) {
        const startByte = offset * chunkSize;
        const endByte = Math.min(fileSize, (offset + 1) * chunkSize);
        chunkSizes.push(
            { startByte, endByte }
        );
    }
    return chunkSizes;
}

function getChunks(fileData) {
    return Observable.create((observer) => {
        chunkReader(0, fileData, observer);
    }).pipe(publish());
}

function chunkReader(index, fileData, observer) {
    if (index >= fileData.chunkSizes.length) {
        observer.complete();
    } else {
        const fileReader = new FileReader();
        const chunk = fileData.chunkSizes[index];
        fileReader.onloadend = (evt: any) => {
            const unint8Array = new Uint8Array(evt.target.result);
            observer.next({
                fileSize: fileData.file.size,
                fileName: fileData.file.name,
                byteArray: unint8Array,
                sequence: index + 1,
                totalChunks: fileData.chunkSizes.length,
                fileHash: null,
            });
            chunkReader(index + 1, fileData, observer);
        };
        const chunkBlob = fileData.file.slice(chunk.startByte, chunk.endByte);
        fileReader.readAsArrayBuffer(chunkBlob);
    }
}

function calculateCheckSum(chunks$) {
    var SHA256 = CryptoJS.algo.SHA256.create();

    return chunks$.pipe(map(chunks => {
        chunks.forEach(chunk => {
            const wordBuffer = CryptoJS.lib.WordArray.create(chunk.byteArray);
            SHA256.update(wordBuffer);
        });
        return SHA256.finalize().toString();
    }))
}

function startChunkUpload(chunkArray$, checkSum$, progress$) {
    combineLatest(chunkArray$, checkSum$, (chunksArray, checkSum) => {
        const chunksWithHash = chunksArray.map(chunk => {
            chunk.checkSum = checkSum;
            return chunk;
        });
        return chunksWithHash;
    }).pipe(
        filter((chunks) => chunks.length > 0),
        map((chunks) => uploadFirstChunk(chunks, progress$))
    )
        .subscribe();
}

function uploadFirstChunk(chunks, progress$) {
    const chunk = chunks[0]
    const firstChunk$ = httpUpload(getChunkBodyData(chunk))
        .pipe(
            tap((response) => {
                if (response.progress) {
                    progress$.next(calculateTotalProgress(chunk, response.progress));
                }
            }),
            filter((response) => response.status),
            take(1),
            map((response) => {
                if (chunks.length > 1) {
                    return uploadRemainingChunks(chunks, progress$);
                } else {
                    completeUpload(progress$);
                }
            }),
            catchError((error) => handleError(chunk, error))
        );
    chunkQueue$.next(firstChunk$);
}

function getChunkBodyData(chunk) {
    chunk.data = new Blob([chunk.byteArray]);
    chunk.byteArray = null;
    const data = new FormData();
    data.append('checksum', chunk.checkSum);
    data.append('sequence', chunk.sequence);
    data.append('file', chunk.data);
    return data;
}

function uploadRemainingChunks(chunks, progress$) {
    const remainingChunks = chunks.filter((chunk) => chunk.sequence > 1);
    
    uploadChunk(0, remainingChunks, progress$);
}

function uploadChunk(index, chunks, progress$) {
    const chunk = chunks[index];
    const chunk$ = httpUpload(getChunkBodyData(chunk))
        .pipe(
            tap((response) => {
                if (response.progress) {
                    progress$.next(calculateTotalProgress(chunk, response.progress));
                }
            }),
            filter((response) => response.status),
            take(1),
            map((response) => {
                if (chunk.sequence === chunk.totalChunks) {
                    completeUpload(progress$);
                } else {
                    uploadChunk(index + 1, chunks, progress$);
                }
                return { status: 'done' };
            }),
            catchError((error) => handleError(chunk, error))
        );
    chunkQueue$.next(chunk$);
}

function calculateTotalProgress(chunk, progress) {
    const chunkPercentage = (100 / chunk.totalChunks);
    const percentageComplete = (chunk.sequence - 1) * chunkPercentage;
    return Math.round((progress/ chunk.totalChunks) + percentageComplete);
}

function completeUpload(progress$) {
    progress$.next('complete');
}

function handleError(chunk, error) {
    return of(error);
}
