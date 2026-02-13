import * as assert from 'assert';
import { ModuleResolver } from '../../src/analysis/moduleResolver';

describe('ModuleResolver', () => {
    let resolver: ModuleResolver;

    beforeEach(() => {
        resolver = new ModuleResolver('.');
    });

    it('should start with no modules detected', () => {
        assert.strictEqual(resolver.getModules().size, 0);
    });

    it('should return null for unknown file modules', () => {
        const result = resolver.resolveFileModule('nonexistent/file.cpp');
        assert.strictEqual(result, null);
    });
});
