tasks.register<Exec>("npmBuild") {
    commandLine("npm", "run", "build")
}

tasks.register("assembleDebug") {
    dependsOn("npmBuild")
}

tasks.register("compileDebugSources") {
    dependsOn("npmBuild")
}

tasks.register("build") {
    dependsOn("npmBuild")
}

tasks.register<Exec>("npmLint") {
    commandLine("npm", "run", "lint")
}

tasks.register("lint") {
    dependsOn("npmLint")
}

tasks.register("lintDebug") {
    dependsOn("npmLint")
}
