import { runTests } from 'vscode-test';

async function main() {
    try {
        await runTests({
            version: 'stable',
            extensionDevelopmentPath: __dirname,
            extensionTestsPath: `${__dirname}/suite`,
            launchArgs: ['--disable-extensions'],
        });
    } catch (err) {
        console.error('Failed to run tests:');
        console.error(err);
        process.exit(1);
    }
}

main();