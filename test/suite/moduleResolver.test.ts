import { expect } from 'chai';
import { ModuleResolver } from '../../src/analysis/moduleResolver';
import { ModuleDescriptor } from '../../src/models/moduleDescriptor';

describe('ModuleResolver', () => {
    let resolver: ModuleResolver;

    beforeEach(() => {
        resolver = new ModuleResolver('.');
    });

    it('should resolve module dependencies correctly', () => {
        const moduleA: ModuleDescriptor = { name: 'ModuleA', path: 'src/A', type: 'directory', files: new Set(), dependencies: ['ModuleB'] } as any;
        const moduleB: ModuleDescriptor = { name: 'ModuleB', path: 'src/B', type: 'directory', files: new Set(), dependencies: [] } as any;
        // TODO: add proper module resolver tests once API stabilizes
    });

    it('should return empty modules when none detected', () => {
        expect(resolver.getModules().size).to.equal(0);
    });
});