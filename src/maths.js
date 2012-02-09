// Helpers for maths

Maths = {};
Maths.normalizedDeviation = function (array) {
    return Maths.deviation(array) / Maths.average(array);
};
Maths.deviation = function (array) {
    var avg = Maths.average(array);
    var count = array.length;
    var i = count - 1;
    var v = 0;
    while (i >= 0) {
        v += Math.pow((array[i] - avg), 2);
        i = i - 1;
    }
    return Math.sqrt(v / count);
};
Maths.average = function (array) {
    var count = array.length;
    var i = count - 1;
    var sum = 0;
    while (i >= 0) {
        sum += array[i];
        i = i - 1;
    }
    return sum / count;
};


exports.Maths = Maths;
