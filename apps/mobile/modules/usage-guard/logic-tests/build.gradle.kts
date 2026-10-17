plugins { kotlin("jvm") version "2.2.0" }

repositories { mavenCentral() }

dependencies { testImplementation(kotlin("test")) }

kotlin { sourceSets["main"].kotlin.srcDir("../android/src/main/java/expo/modules/usageguard/logic") }

tasks.test {
  useJUnitPlatform()
  testLogging { events("passed", "failed") }
}
