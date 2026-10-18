package expo.modules.usageguard.logic

/** Days start at 04:00 local (spec §4.3 rule 6). Returns days since the epoch. */
fun dayIndex(wall: Long, offsetMinutes: Int, boundaryHour: Int = 4): Long =
  Math.floorDiv(wall + offsetMinutes * MS_PER_MINUTE - boundaryHour * MS_PER_HOUR, MS_PER_DAY)

private const val MS_PER_MINUTE = 60_000L
private const val MS_PER_HOUR = 3_600_000L
private const val MS_PER_DAY = 86_400_000L
