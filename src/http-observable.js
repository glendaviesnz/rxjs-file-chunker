import * as axios from 'axios';
import { Observable } from 'rxjs';

import { appConfig } from './config.js';

export function httpUpload(file) {
    return Observable.create((observer) => {
        var config = {
            onUploadProgress: function (progressEvent) {
                var percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                observer.next({ progress: percentCompleted });
            }
        };
        axios.post(`${appConfig.apiUrl}/upload`, file, config)
            .then(function (response) {
                observer.next({ status: response.status });
                observer.complete();
            })
            .catch(function (error) {
                observer.error(error);
            });
    })
};