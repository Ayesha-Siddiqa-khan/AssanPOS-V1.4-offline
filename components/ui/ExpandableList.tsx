import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ExpandableListItem {
  id: string | number;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  rightContent?: React.ReactNode;
  metadata?: string;
}

interface ExpandableListProps {
  items: ExpandableListItem[];
  expandedItems?: Record<string | number, boolean>;
  onToggleExpand?: (id: string | number) => void;
  renderHeader?: (item: ExpandableListItem, isExpanded: boolean) => React.ReactNode;
  renderChildren?: (item: ExpandableListItem) => React.ReactNode;
  containerStyle?: ViewStyle;
  headerStyle?: ViewStyle;
  titleStyle?: TextStyle;
  subtitleStyle?: TextStyle;
  emptyText?: string;
}

/**
 * Reusable expandable list component with collapse/expand functionality
 * 
 * @example
 * ```tsx
 * const [expanded, setExpanded] = useState<Record<number, boolean>>({});
 * 
 * <ExpandableList
 *   items={products.map(product => ({
 *     id: product.id,
 *     title: product.name,
 *     subtitle: product.category,
 *     children: <VariantList variants={product.variants} />,
 *   }))}
 *   expandedItems={expanded}
 *   onToggleExpand={(id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))}
 * />
 * ```
 */
export const ExpandableList: React.FC<ExpandableListProps> = ({
  items,
  expandedItems = {},
  onToggleExpand,
  renderHeader,
  renderChildren,
  containerStyle,
  headerStyle,
  titleStyle,
  subtitleStyle,
  emptyText = 'No items found',
}) => {
  const [internalExpanded, setInternalExpanded] = useState<Record<string | number, boolean>>({});
  
  const expandedState = onToggleExpand ? expandedItems : internalExpanded;
  const handleToggle = onToggleExpand || ((id: string | number) => {
    setInternalExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  });

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="search-outline" size={48} color="#d1d5db" />
        <Text style={styles.emptyText}>{emptyText}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, containerStyle]}>
      {items.map((item) => {
        const isExpanded = expandedState[item.id] || false;
        const hasChildren = !!item.children || !!renderChildren;

        return (
          <View key={item.id} style={styles.itemContainer}>
            {renderHeader ? (
              renderHeader(item, isExpanded)
            ) : (
              <TouchableOpacity
                style={[styles.header, headerStyle]}
                onPress={() => hasChildren && handleToggle(item.id)}
                disabled={!hasChildren}
                activeOpacity={0.7}
              >
                <View style={styles.headerLeft}>
                  {hasChildren && (
                    <Ionicons
                      name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                      size={20}
                      color="#6b7280"
                      style={styles.chevron}
                    />
                  )}
                  <View style={styles.headerText}>
                    <Text style={[styles.title, titleStyle]}>{item.title}</Text>
                    {item.subtitle && (
                      <Text style={[styles.subtitle, subtitleStyle]}>{item.subtitle}</Text>
                    )}
                  </View>
                </View>
                
                {item.rightContent && (
                  <View style={styles.headerRight}>{item.rightContent}</View>
                )}
                
                {item.metadata && (
                  <Text style={styles.metadata}>{item.metadata}</Text>
                )}
              </TouchableOpacity>
            )}

            {isExpanded && hasChildren && (
              <View style={styles.childrenContainer}>
                {renderChildren ? renderChildren(item) : item.children}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  itemContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#ffffff',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  chevron: {
    marginRight: 8,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  headerRight: {
    marginLeft: 12,
  },
  metadata: {
    fontSize: 12,
    color: '#9ca3af',
    marginLeft: 8,
  },
  childrenContainer: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: '#f9fafb',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    marginTop: 12,
    fontSize: 15,
    color: '#9ca3af',
  },
});
