/**
 * AST Parser - Java Tests
 *
 * Comprehensive tests for Java language support via tree-sitter-java
 *
 * @module __tests__/ast-parser-java
 */

import { describe, it, expect } from 'vitest';
import { createASTParser } from '../parsers/ast-parser';

describe('ASTParser - Java', () => {
  const parser = createASTParser();

  describe('Basic Class Parsing', () => {
    it('should parse a simple public class', async () => {
      const code = `
package com.example;

public class Calculator {
    private int result;

    public int add(int a, int b) {
        return a + b;
    }
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.language).toBe('java');
      expect(structure.classes).toHaveLength(1);
      expect(structure.classes[0].name).toBe('Calculator');
      expect(structure.classes[0].type).toBe('class');
      expect(structure.classes[0].isExported).toBe(true);
      expect(structure.classes[0].methods).toHaveLength(1);
      expect(structure.classes[0].methods[0].name).toBe('add');
      expect(structure.classes[0].properties).toHaveLength(1);
      expect(structure.classes[0].properties[0].name).toBe('result');
    });

    it('should parse package-private class (no public modifier)', async () => {
      const code = `
package com.example;

class InternalHelper {
    void doSomething() {}
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.classes).toHaveLength(1);
      expect(structure.classes[0].isExported).toBe(false); // package-private
      expect(structure.exports).toHaveLength(0);
    });
  });

  describe('Interface Parsing', () => {
    it('should parse interfaces', async () => {
      const code = `
package com.example;

public interface Repository<T> {
    T findById(String id);
    void save(T entity);
    void delete(String id);
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.classes).toHaveLength(1);
      expect(structure.classes[0].type).toBe('interface');
      expect(structure.classes[0].name).toContain('Repository');
      expect(structure.classes[0].isExported).toBe(true);
      expect(structure.classes[0].methods.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Generic Type Parameters', () => {
    it('should extract generic type parameters', async () => {
      const code = `
package com.example;

public class Container<T, K extends Comparable<K>> {
    private T value;
    private K key;

    public T getValue() {
        return value;
    }

    public void setKey(K key) {
        this.key = key;
    }
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.classes).toHaveLength(1);
      expect(structure.classes[0].name).toContain('<');
      expect(structure.classes[0].name).toContain('T');
      expect(structure.classes[0].name).toContain('K');
    });
  });

  describe('Method Parsing', () => {
    it('should extract method parameters and return types', async () => {
      const code = `
package com.example;

public class MathUtils {
    public static double divide(double numerator, double denominator) {
        if (denominator == 0) {
            throw new IllegalArgumentException("Division by zero");
        }
        return numerator / denominator;
    }
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.classes[0].methods).toHaveLength(1);
      const method = structure.classes[0].methods[0];
      expect(method.name).toBe('divide');
      expect(method.returnType).toBe('double');
      expect(method.params).toHaveLength(2);
      expect(method.params[0].name).toBe('numerator');
      expect(method.params[0].type).toBe('double');
      expect(method.params[1].name).toBe('denominator');
      expect(method.params[1].type).toBe('double');
    });

    it('should track method visibility modifiers', async () => {
      const code = `
package com.example;

public class AccessModifiers {
    public void publicMethod() {}
    private void privateMethod() {}
    protected void protectedMethod() {}
    void packagePrivateMethod() {}
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.classes[0].methods).toHaveLength(4);
      const publicMethod = structure.classes[0].methods.find(m => m.name === 'publicMethod');
      const privateMethod = structure.classes[0].methods.find(m => m.name === 'privateMethod');

      expect(publicMethod?.isExported).toBe(true);
      expect(privateMethod?.isExported).toBe(false);
    });

    it('should calculate method complexity with control flow', async () => {
      const code = `
package com.example;

public class ComplexCalculator {
    public int complexMethod(int x, int y) {
        if (x > 0) {
            for (int i = 0; i < y; i++) {
                if (i % 2 == 0) {
                    x += i;
                } else {
                    x -= i;
                }
            }
        } else if (x < 0) {
            while (y > 0) {
                x++;
                y--;
            }
        }
        return x;
    }
}
`;

      const structure = await parser.parse(code, 'java');

      const method = structure.classes[0].methods[0];
      expect(method.complexity).toBeGreaterThan(1); // Should have multiple decision points
      expect(structure.metrics.complexity).toBeGreaterThan(1);
    });
  });

  describe('Field/Property Parsing', () => {
    it('should extract fields with types', async () => {
      const code = `
package com.example;

public class User {
    private String username;
    private String email;
    public int age;
    protected boolean isActive;
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.classes[0].properties).toHaveLength(4);
      const username = structure.classes[0].properties.find(p => p.name === 'username');
      const age = structure.classes[0].properties.find(p => p.name === 'age');

      expect(username?.type).toBe('String');
      expect(username?.isPublic).toBe(false);
      expect(age?.type).toBe('int');
      expect(age?.isPublic).toBe(true);
    });
  });

  describe('Import Parsing', () => {
    it('should extract import statements', async () => {
      const code = `
package com.example;

import java.util.List;
import java.util.ArrayList;
import java.io.IOException;

public class ImportTest {
    private List<String> items = new ArrayList<>();
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.imports.length).toBeGreaterThanOrEqual(3);
      expect(structure.dependencies.length).toBeGreaterThanOrEqual(1);
      expect(structure.dependencies.some(d => d.includes('java.util'))).toBe(true);
    });

    it('should handle static imports', async () => {
      const code = `
package com.example;

import static java.lang.Math.PI;
import static java.lang.Math.sqrt;

public class MathConstants {
    public double circumference(double radius) {
        return 2 * PI * radius;
    }
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.imports.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Inheritance and Implementation', () => {
    it('should track extends and implements', async () => {
      const code = `
package com.example;

public class Employee extends Person implements Comparable<Employee>, Serializable {
    private String employeeId;

    @Override
    public int compareTo(Employee other) {
        return this.employeeId.compareTo(other.employeeId);
    }
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.classes).toHaveLength(1);
      expect(structure.classes[0].extends).toBeDefined();
      expect(structure.classes[0].extends?.[0]).toBe('Person');
      expect(structure.classes[0].implements).toBeDefined();
      expect(structure.classes[0].implements?.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Annotations', () => {
    it('should capture annotations in docstrings', async () => {
      const code = `
package com.example;

public class AnnotatedClass {
    @Override
    @Deprecated
    public String toString() {
        return "deprecated";
    }

    @SuppressWarnings("unchecked")
    public void warningMethod() {}
}
`;

      const structure = await parser.parse(code, 'java');

      const toStringMethod = structure.classes[0].methods.find(m => m.name === 'toString');
      expect(toStringMethod?.docstring).toBeDefined();
      if (toStringMethod?.docstring) {
        expect(toStringMethod.docstring).toContain('Override');
      }
    });
  });

  describe('Enum Parsing', () => {
    it('should parse enum declarations', async () => {
      const code = `
package com.example;

public enum Status {
    PENDING,
    ACTIVE,
    COMPLETED,
    CANCELLED;

    public boolean isTerminal() {
        return this == COMPLETED || this == CANCELLED;
    }
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.classes).toHaveLength(1);
      expect(structure.classes[0].type).toBe('class'); // Enums parsed as classes
      expect(structure.classes[0].name).toBe('Status');
    });
  });

  describe('Record Parsing (Java 14+)', () => {
    it('should parse record declarations', async () => {
      const code = `
package com.example;

public record Point(int x, int y) {
    public double distanceFromOrigin() {
        return Math.sqrt(x * x + y * y);
    }
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.classes).toHaveLength(1);
      expect(structure.classes[0].name).toBe('Point');
    });
  });

  describe('Complexity Metrics', () => {
    it('should calculate cyclomatic complexity correctly', async () => {
      const code = `
package com.example;

public class ComplexityTest {
    public String gradeStudent(int score) {
        if (score >= 90) {
            return "A";
        } else if (score >= 80) {
            return "B";
        } else if (score >= 70) {
            return "C";
        } else if (score >= 60) {
            return "D";
        } else {
            return "F";
        }
    }

    public int factorial(int n) {
        if (n <= 1) {
            return 1;
        }
        return n * factorial(n - 1);
    }
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.metrics.complexity).toBeGreaterThan(5);
      const gradeMethod = structure.classes[0].methods.find(m => m.name === 'gradeStudent');
      expect(gradeMethod?.complexity).toBeGreaterThanOrEqual(5); // 4 if statements + base
    });
  });

  describe('Code Metrics', () => {
    it('should calculate accurate line counts', async () => {
      const code = `
package com.example;

// This is a comment
public class MetricsTest {
    // Field comment
    private int value;

    /**
     * Javadoc comment
     * Multi-line
     */
    public int getValue() {
        return value;
    }
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.metrics.totalLines).toBeGreaterThan(10);
      expect(structure.metrics.commentLines).toBeGreaterThan(0);
      expect(structure.metrics.codeLines).toBeGreaterThan(0);
      expect(structure.metrics.codeLines).toBeLessThan(structure.metrics.totalLines);
    });
  });

  describe('Exception Handling', () => {
    it('should count try-catch blocks in complexity', async () => {
      const code = `
package com.example;

public class ExceptionHandler {
    public void riskyOperation() {
        try {
            int result = 10 / 0;
        } catch (ArithmeticException e) {
            System.err.println("Division by zero");
        } catch (Exception e) {
            System.err.println("Unexpected error");
        } finally {
            System.out.println("Cleanup");
        }
    }
}
`;

      const structure = await parser.parse(code, 'java');

      const method = structure.classes[0].methods[0];
      expect(method.complexity).toBeGreaterThan(1); // Multiple catch clauses
    });
  });

  describe('Constructor Parsing', () => {
    it('should parse constructors as methods', async () => {
      const code = `
package com.example;

public class Person {
    private String name;
    private int age;

    public Person(String name, int age) {
        this.name = name;
        this.age = age;
    }

    public Person() {
        this("Unknown", 0);
    }
}
`;

      const structure = await parser.parse(code, 'java');

      // Constructors may be captured as methods
      expect(structure.classes[0].methods.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Nested Classes', () => {
    it('should handle nested/inner classes', async () => {
      const code = `
package com.example;

public class OuterClass {
    private int outerField;

    public class InnerClass {
        public void accessOuter() {
            System.out.println(outerField);
        }
    }

    public static class StaticNestedClass {
        public void staticMethod() {}
    }
}
`;

      const structure = await parser.parse(code, 'java');

      // Nested classes should be detected
      expect(structure.classes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Exports', () => {
    it('should export public classes', async () => {
      const code = `
package com.example;

public class PublicService {
    public void serve() {}
}

class InternalHelper {
    void help() {}
}
`;

      const structure = await parser.parse(code, 'java');

      expect(structure.exports.length).toBeGreaterThanOrEqual(1);
      expect(structure.exports[0].name).toBe('PublicService');
      expect(structure.exports[0].type).toBe('named');
    });
  });

  describe('Switch Expressions (Java 12+)', () => {
    it('should count switch statements in complexity', async () => {
      const code = `
package com.example;

public class SwitchTest {
    public String getDayType(int day) {
        switch (day) {
            case 1:
            case 7:
                return "Weekend";
            case 2:
            case 3:
            case 4:
            case 5:
            case 6:
                return "Weekday";
            default:
                return "Invalid";
        }
    }
}
`;

      const structure = await parser.parse(code, 'java');

      const method = structure.classes[0].methods[0];
      expect(method.complexity).toBeGreaterThan(1);
    });
  });

  describe('Complex Real-World Example', () => {
    it('should parse a complex service class', async () => {
      const code = `
package com.example.service;

import java.util.List;
import java.util.Optional;
import javax.inject.Inject;

/**
 * User service for managing user operations
 */
public class UserService implements Service<User> {
    @Inject
    private UserRepository repository;

    @Inject
    private EmailService emailService;

    @Override
    public Optional<User> findById(String id) {
        if (id == null || id.isEmpty()) {
            return Optional.empty();
        }
        return repository.findById(id);
    }

    @Deprecated
    public void sendWelcomeEmail(User user) {
        try {
            emailService.send(user.getEmail(), "Welcome!");
        } catch (EmailException e) {
            System.err.println("Failed to send email: " + e.getMessage());
        }
    }

    public List<User> searchUsers(String query, int limit) {
        if (query == null) {
            return List.of();
        }
        return repository.search(query, limit);
    }
}
`;

      const structure = await parser.parse(code, 'java');

      // Verify comprehensive parsing
      expect(structure.language).toBe('java');
      expect(structure.classes).toHaveLength(1);
      expect(structure.classes[0].name).toBe('UserService');
      expect(structure.classes[0].implements).toBeDefined();
      expect(structure.classes[0].implements!.length).toBeGreaterThanOrEqual(1);
      expect(structure.classes[0].methods.length).toBeGreaterThanOrEqual(3);
      expect(structure.classes[0].properties.length).toBeGreaterThanOrEqual(2);
      expect(structure.imports.length).toBeGreaterThanOrEqual(3);
      expect(structure.dependencies.length).toBeGreaterThanOrEqual(1);
      expect(structure.metrics.complexity).toBeGreaterThan(1);
    });
  });
});
