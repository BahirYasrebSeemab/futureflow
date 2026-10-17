package expo.modules.usageguard.logic

/** Days start at 04:00 local (spec §4.3 rule 6). Returns days since the epoch. */
fun dayIndex(wall: Long, offsetMinutes: Int, boundaryHour: Int = 4): Long = 0
