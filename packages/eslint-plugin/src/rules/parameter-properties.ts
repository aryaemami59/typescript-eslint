import type { TSESTree } from '@typescript-eslint/utils';

import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { createRule, nullThrows } from '../util';

type Modifier =
  | 'private'
  | 'private readonly'
  | 'protected'
  | 'protected readonly'
  | 'public'
  | 'public readonly'
  | 'readonly';

type Prefer = 'class-property' | 'parameter-property';

export type Options = [
  {
    allow?: Modifier[];
    prefer?: Prefer;
  },
];

export type MessageIds = 'preferClassProperty' | 'preferParameterProperty';

export default createRule<Options, MessageIds>({
  name: 'parameter-properties',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require or disallow parameter properties in class constructors',
    },
    messages: {
      preferClassProperty:
        'Property {{parameter}} should be declared as a class property.',
      preferParameterProperty:
        'Property {{parameter}} should be declared as a parameter property.',
    },
    schema: [
      {
        type: 'object',
        $defs: {
          modifier: {
            type: 'string',
            enum: [
              'readonly',
              'private',
              'protected',
              'public',
              'private readonly',
              'protected readonly',
              'public readonly',
            ],
          },
        },
        additionalProperties: false,
        properties: {
          allow: {
            type: 'array',
            description:
              'Whether to allow certain kinds of properties to be ignored.',
            items: {
              $ref: '#/items/0/$defs/modifier',
            },
          },
          prefer: {
            type: 'string',
            description:
              'Whether to prefer class properties or parameter properties.',
            enum: ['class-property', 'parameter-property'],
          },
        },
      },
    ],
  },
  defaultOptions: [
    {
      allow: [],
      prefer: 'class-property',
    },
  ],
  create(context, [{ allow = [], prefer = 'class-property' }]) {
    /**
     * Gets the modifiers of `node`.
     * @param node the node to be inspected.
     */
    function getModifiers(
      node: TSESTree.PropertyDefinition | TSESTree.TSParameterProperty,
    ): Modifier {
      const modifiers: Modifier[] = [];

      if (node.accessibility) {
        modifiers.push(node.accessibility);
      }
      if (node.readonly) {
        modifiers.push('readonly');
      }

      return modifiers.filter(Boolean).join(' ') as Modifier;
    }

    if (prefer === 'class-property') {
      return {
        TSParameterProperty(node): void {
          const modifiers = getModifiers(node);

          if (!allow.includes(modifiers)) {
            // HAS to be an identifier or assignment or TSC will throw
            if (
              node.parameter.type !== AST_NODE_TYPES.Identifier &&
              node.parameter.type !== AST_NODE_TYPES.AssignmentPattern
            ) {
              return;
            }

            const name =
              node.parameter.type === AST_NODE_TYPES.Identifier
                ? node.parameter.name
                : // has to be an Identifier or TSC will throw an error
                  (node.parameter.left as TSESTree.Identifier).name;

            context.report({
              node,
              messageId: 'preferClassProperty',
              data: {
                parameter: name,
              },
            });
          }
        },
      };
    }

    interface PropertyNodes {
      classProperty?: TSESTree.PropertyDefinition;
      constructorAssignment?: TSESTree.AssignmentExpression;
      constructorParameter?: TSESTree.Identifier;
    }

    const propertyNodesByNameStack: Map<string, PropertyNodes>[] = [];

    function getNodesByName(name: string): PropertyNodes {
      const propertyNodesByName =
        propertyNodesByNameStack[propertyNodesByNameStack.length - 1];
      const existing = propertyNodesByName.get(name);
      if (existing) {
        return existing;
      }

      const created: PropertyNodes = {};
      propertyNodesByName.set(name, created);
      return created;
    }

    function typeAnnotationsMatch(
      classProperty: TSESTree.PropertyDefinition,
      constructorParameter: TSESTree.Identifier,
    ): boolean {
      if (
        !classProperty.typeAnnotation ||
        !constructorParameter.typeAnnotation
      ) {
        return (
          classProperty.typeAnnotation === constructorParameter.typeAnnotation
        );
      }

      return (
        context.sourceCode.getText(classProperty.typeAnnotation) ===
        context.sourceCode.getText(constructorParameter.typeAnnotation)
      );
    }

    return {
      ':matches(ClassDeclaration, ClassExpression):exit'(): void {
        const propertyNodesByName = nullThrows(
          propertyNodesByNameStack.pop(),
          'Stack should exist on class exit',
        );

        for (const [name, nodes] of propertyNodesByName) {
          if (
            nodes.classProperty &&
            nodes.constructorAssignment &&
            nodes.constructorParameter &&
            typeAnnotationsMatch(
              nodes.classProperty,
              nodes.constructorParameter,
            )
          ) {
            context.report({
              node: nodes.classProperty,
              messageId: 'preferParameterProperty',
              data: {
                parameter: name,
              },
            });
          }
        }
      },

      ClassBody(node): void {
        for (const element of node.body) {
          if (
            element.type === AST_NODE_TYPES.PropertyDefinition &&
            element.key.type === AST_NODE_TYPES.Identifier &&
            !element.value &&
            !allow.includes(getModifiers(element))
          ) {
            getNodesByName(element.key.name).classProperty = element;
          }
        }
      },

      'ClassDeclaration, ClassExpression'(): void {
        propertyNodesByNameStack.push(new Map());
      },

      'MethodDefinition[kind="constructor"]'(
        node: TSESTree.MethodDefinition,
      ): void {
        for (const parameter of node.value.params) {
          if (parameter.type === AST_NODE_TYPES.Identifier) {
            getNodesByName(parameter.name).constructorParameter = parameter;
          }
        }

        for (const statement of node.value.body?.body ?? []) {
          if (
            statement.type !== AST_NODE_TYPES.ExpressionStatement ||
            statement.expression.type !== AST_NODE_TYPES.AssignmentExpression ||
            statement.expression.left.type !==
              AST_NODE_TYPES.MemberExpression ||
            statement.expression.left.object.type !==
              AST_NODE_TYPES.ThisExpression ||
            statement.expression.left.property.type !==
              AST_NODE_TYPES.Identifier ||
            statement.expression.right.type !== AST_NODE_TYPES.Identifier
          ) {
            break;
          }

          getNodesByName(
            statement.expression.right.name,
          ).constructorAssignment = statement.expression;
        }
      },
    };
  },
});
