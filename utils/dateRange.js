const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parseBoundary(value, endOfDay) {
    const text = String(value).trim();
    const date = new Date(DATE_ONLY.test(text)
        ? `${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`
        : text);

    if (Number.isNaN(date.getTime())) {
        const error = new Error('startDate and endDate must be valid ISO dates');
        error.code = 'INVALID_DATE_RANGE';
        error.statusCode = 400;
        throw error;
    }
    return date;
}

function dateRange(startDate, endDate) {
    if (!startDate || !endDate) return null;

    const start = parseBoundary(startDate, false);
    const end = parseBoundary(endDate, true);
    if (start > end) {
        const error = new Error('startDate must be before or equal to endDate');
        error.code = 'INVALID_DATE_RANGE';
        error.statusCode = 400;
        throw error;
    }

    return { gte: start, lte: end };
}

module.exports = { dateRange };
