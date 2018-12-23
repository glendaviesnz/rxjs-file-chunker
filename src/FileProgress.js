import React from 'react';

const FileProgress = ({ filename, progress }) => {
    return (
        <li className="file-list-item">
            <div>{filename}:</div> <progress max="100" value={progress}></progress>
        </li>
    )
}

export default FileProgress;