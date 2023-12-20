// моделює планувальник дискового доступу.
// Основна мета цього класу - обчислити час доступу до даних на
// диску в залежності від певних алгоритмів планування.
class DiskScheduler {
    constructor(tracks = 500, sectors_per_track = 100, current_track = 0, rotation_delay = 8) {
        this.tracks = tracks;
        this.sectors_per_track = sectors_per_track;
        this.current_track = current_track;
        this.rotation_delay = rotation_delay;
    }

    // час пошуку доріжки дорівнює добутку кількості пройдених доріжок на час переміщення на одну доріжку
    // час переміщення на одну доріжку механізму = 10 мс
    // час затримки обертання = 8мс
    calculateSeekTime(track) {
        const seekDistance = Math.abs(this.current_track - track);
        const trackSeekTime = seekDistance * 10; // Час переміщення на одну доріжку
        const outerTrackSeekTime = 130; // Час переміщення до зовнішньої доріжки (або від неї)

        // Обчислюємо загальний час пошуку доріжки, враховуючи обидва варіанти
        const totalSeekTime = trackSeekTime + (seekDistance * outerTrackSeekTime);

        return totalSeekTime + this.rotation_delay;
    }


    //Виконання за принципом "перший прийшов - перший обслуговується":
    // Алгоритм FCFS просто віддає перший запит із черги на виконання.
    // перший запит, який надійшов, обслуговується першим,
    // а потім інші запити виконуються в порядку їхнього надходження до черги.
    fcfs(requestQueue) {
        let total_time = 0;
        for (const track of requestQueue) {
            total_time += this.calculateSeekTime(track);
            this.current_track = track;
        }
        return total_time;
    }

    // завжди обслуговувати той запит, до якого потрібно найменше часу переміщення між поточною позицією головки і запитаною доріжкою.
    sstf(requestQueue) {
        let total_time = 0;
        while (requestQueue.length > 0) {
            // порівнюється і знаходиться найбільш оптимальна відстань
            const next_track = requestQueue.reduce((minTrack, track) => {
                const minDistance = Math.abs(this.current_track - minTrack);
                const distance = Math.abs(this.current_track - track);
                return distance < minDistance ? track : minTrack;
            }, requestQueue[0]);

            total_time += this.calculateSeekTime(next_track);
            this.current_track = next_track;
            requestQueue.splice(requestQueue.indexOf(next_track), 1);
        }
        return total_time;
    }

    // працює, обслуговуючи запити в порядку зростання (або зниження) номерів доріжок.
    // Коли всі запити з одного напрямку були обслужені (наприклад, зростання),
    // і немає більше запитів в цьому напрямку, алгоритм змінює напрямок і
    // обслуговує запити в протилежному напрямку (наприклад, зниження).
    look(requestQueue) {
        let total_time = 0;
        let direction = 1;  // 1 for moving towards outer tracks, -1 for inner tracks
        while (requestQueue.length > 0) {
            let next_track;
            if (direction === 1) {
                next_track = requestQueue.filter(track => track > this.current_track)
                    .reduce((minTrack, track) => Math.min(minTrack, track), null);
                if (next_track === null) {
                    direction = -1;
                    continue;
                }
            } else {
                next_track = requestQueue.filter(track => track < this.current_track)
                    .reduce((maxTrack, track) => Math.max(maxTrack, track), null);
                if (next_track === null) {
                    direction = 1;
                    continue;
                }
            }
            total_time += this.calculateSeekTime(next_track);
            this.current_track = next_track;
            requestQueue.splice(requestQueue.indexOf(next_track), 1);
        }
        return total_time;
    }

    // базується на ідеї обслуговувати ті запити, які були використані найменшу кількість разів
    lfu(requestQueue, numSegments = 3) {
        let total_time = 0;
        const segments = Array.from({ length: numSegments }, () => []);
        const segmentCounters = Array.from({ length: numSegments }, () => ({}));

        for (const track of requestQueue) {
            const segmentIdx = track % numSegments;
            if (track in segmentCounters[segmentIdx]) {
                segmentCounters[segmentIdx][track]++;
            } else {
                segmentCounters[segmentIdx][track] = 1;
            }
            segments[segmentIdx].push(track);
        }

        while (requestQueue.length > 0) {
            let segmentIdx = requestQueue[0] % numSegments;
            let minCount = Infinity;
            let minTrack = null;

            for (const [track, count] of Object.entries(segmentCounters[segmentIdx])) {
                if (count < minCount) {
                    minCount = count;
                    minTrack = parseInt(track);
                }
            }

            if (minTrack === null) {
                segmentCounters[segmentIdx] = {};
                segmentIdx = (segmentIdx + 1) % numSegments;
                continue;
            }

            total_time += this.calculateSeekTime(minTrack);
            this.current_track = minTrack;
            requestQueue.splice(requestQueue.indexOf(minTrack), 1);
            segments[segmentIdx].splice(segments[segmentIdx].indexOf(minTrack), 1);
            delete segmentCounters[segmentIdx][minTrack];
        }
        return total_time;
    }
}


//це клас, який реалізує систему файлового доступу та управління файлами.
class FileSystem {
    constructor(disk_scheduler, max_requests = 20, buffer_cache_size = 250) {
        this.disk_scheduler = disk_scheduler;
        this.files = {};  // Dictionary to store files and their blocks on disk
        this.max_requests = max_requests;
        this.buffer_cache = {};  // Cache for blocks
        this.buffer_cache_size = buffer_cache_size;
        this.current_requests = 0;
    }

    createFile(filename, num_blocks) {
        if (filename in this.files) {
            throw new Error(`File '${filename}' already exists.`);
        }
        this.files[filename] = Array(num_blocks).fill(null);
    }

    writeBlock(filename, block_num, data) {
        if (!(filename in this.files)) {
            throw new Error(`File '${filename}' does not exist.`);
        }
        if (block_num >= this.files[filename].length || block_num < 0) {
            throw new Error(`Invalid block number ${block_num} for file '${filename}'.`);
        }
        this.files[filename][block_num] = data;
        this.buffer_cache[`${filename}-${block_num}`] = data;  // Adding to cache
    }

    readBlock(filename, block_num) {
        if (!(filename in this.files)) {
            throw new Error(`File '${filename}' does not exist.`);
        }
        if (block_num >= this.files[filename].length || block_num < 0) {
            throw new Error(`Invalid block number ${block_num} for file '${filename}'.`);
        }
        return this.buffer_cache[`${filename}-${block_num}`] || this.files[filename][block_num];
    }

    processRequest(process) {
        if (this.current_requests < this.max_requests) {
            this.current_requests++;
            process.run();
            this.current_requests--;
        } else {
            console.log("Перевищено максимальну кількість запитів.");
        }
    }
}
// Створення екземпляра файлової системи
const disk_scheduler = new DiskScheduler();
const file_system = new FileSystem(disk_scheduler);

// Створення файлів перед генерацією запитів
const numberOfFiles = 10; // Кількість файлів
const maxBlocksPerFile = 500; // Максимальна кількість блоків на файл
for (let i = 0; i < numberOfFiles; i++) {
    const filename = `file${i}.txt`;
    file_system.createFile(filename, maxBlocksPerFile);
}

// Загальна кількість запитів
const totalRequests = 100000;

// Масив для зберігання запитів
const requestQueue = [];

// Цикл для генерації запитів
for (let i = 0; i < totalRequests; i++) {
    const randomFile = `file${Math.floor(Math.random() * numberOfFiles)}.txt`;
    const randomBlock = Math.floor(Math.random() * maxBlocksPerFile);

    const isWriteRequest = Math.random() < 0.5;

    requestQueue.push({
        file: randomFile,
        block: randomBlock,
        isWriteRequest: isWriteRequest,
    });
}
// Цей клас визначає об'єкти, які представляють процеси в системі.
// Кожен процес може взаємодіяти
// з файловою системою, читаючи та записуючи дані в блоки файлів.
class Process {
    constructor({file_system, requestQueue}) {
        this.file_system = file_system;
        this.requestQueue = requestQueue;
    }

    run() {
        for (let i = 0; i < this.requestQueue.length; i++) {
            const request = this.requestQueue[i];
            const { file, block, isWriteRequest } = request;
            if (isWriteRequest) {
                this.file_system.writeBlock(file, block, `Data for block ${block}`);
            } else {
                this.file_system.readBlock(file, block);
            }
        }
    }

}

// Отримання та виведення результатів алгоритмів планування
const request_queue = [143, 86, 147, 91, 171, 19, 62, 96, 78, 9, 10];
const fcfs_time = disk_scheduler.fcfs([...request_queue]);
const sstf_time = disk_scheduler.sstf([...request_queue]);
const look_time = disk_scheduler.look([...request_queue]);
const lfu_time = disk_scheduler.lfu([...request_queue], num_segments = 3);

console.log(`FCFS Time: ${fcfs_time} ms`);
console.log(`SSTF Time: ${sstf_time} ms`);
console.log(`LOOK Time: ${look_time} ms`);
console.log(`LFU Time: ${lfu_time} ms`);
console.log("__________________________________");


