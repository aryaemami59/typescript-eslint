import type { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils';

chai.use((chai, utils) => {
  function nodeOfType(
    this: Chai.AssertionStatic,
    expectedNodeType: AST_NODE_TYPES,
    errorMessage?: string,
  ) {
    if (errorMessage) {
      utils.flag(this, 'message', errorMessage);
    }

    const node: TSESTree.Node | null | undefined = utils.flag(this, 'object');

    const negate: boolean = utils.flag(this, 'negate') ?? false;

    const ssfi: (...args: unknown[]) => unknown = utils.flag(this, 'ssfi');

    const assertion = new chai.Assertion(node, errorMessage, ssfi, true);

    if (negate) {
      (utils.hasProperty(node, 'type') ? assertion : assertion.not).to.have
        .property('type')
        .that.does.not.equal(expectedNodeType);
    } else {
      assertion.to.have.property('type').that.equals(expectedNodeType);
    }
  }

  chai.Assertion.addMethod(nodeOfType.name, nodeOfType);

  chai.assert.isNodeOfType = (node, expectedNodeType, errorMessage) => {
    new chai.Assertion(
      node,
      errorMessage,
      chai.assert.isNodeOfType,
      true,
    ).to.be.nodeOfType(expectedNodeType);
  };

  chai.assert.isNotNodeOfType = (node, expectedNodeType, errorMessage) => {
    new chai.Assertion(
      node,
      errorMessage,
      chai.assert.isNotNodeOfType,
      true,
    ).not.to.be.nodeOfType(expectedNodeType);
  };
});
