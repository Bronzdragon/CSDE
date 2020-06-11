class Autosaver {
    constructor(interval , saveFunc) {
        this._interval = interval * 1000;
        this._timeoutId = null;
        this._saveFunc = saveFunc;
    }

    get interval() {
        return this._interval;
    }
    set interval(newInterval) {
        newInterval = Number(newInterval);
        if (newInterval < 1) {
            throw new TypeError("Invalid number, must be positive");
        }
        this._interval = newInterval;
    }

    start() {
        if (this._timeoutId) this.stop();
        this._timeoutId = window.setTimeout(
            () => this._autosave(),
            this._interval
        );
    }

    stop() {
        window.clearTimeout(this._timeoutId);
        this._timeoutId = null;
    }

    _autosave() {
        this._saveFunc();
        this.start();
    }
}

module.exports = Autosaver;