import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ConditionGroup, ConditionRule, StateEffect, StoryVariable } from '@shared/types';
import { createId, formatConditionNatural, getOperatorsForVariableType } from '@shared/defaults';

interface ConditionEditorProps {
  value?: ConditionGroup;
  variables: StoryVariable[];
  onChange: (next?: ConditionGroup) => void;
}

/**
 * Natural-sentence Composite Condition Editor (Req 2.5):
 * Supports "全部满足（且）" / "任一满足（或）" / "不满足（非）" and automatically filters
 * valid comparison operators by variable type. Zero code expressions exposed!
 */
export const ConditionEditor: React.FC<ConditionEditorProps> = ({
  value,
  variables,
  onChange,
}) => {
  const group: ConditionGroup = value ?? { logic: 'all', rules: [] };

  const addRule = () => {
    const firstVar = variables[0];
    if (!firstVar) return;
    const ops = getOperatorsForVariableType(firstVar.type);
    const newRule: ConditionRule = {
      id: createId('rule'),
      variableId: firstVar.id,
      operator: ops[0].value,
      value: firstVar.type === 'number' ? 1 : firstVar.type === 'boolean' ? true : '',
    };
    onChange({ logic: group.logic, rules: [...group.rules, newRule] });
  };

  const updateRule = (ruleId: string, patch: Partial<ConditionRule>) => {
    const nextRules = group.rules.map((r) => {
      if (r.id !== ruleId) return r;
      const merged = { ...r, ...patch };
      if (patch.variableId) {
        const v = variables.find((item) => item.id === patch.variableId);
        if (v) {
          const validOps = getOperatorsForVariableType(v.type);
          if (!validOps.some((o) => o.value === merged.operator)) {
            merged.operator = validOps[0].value;
          }
          if (v.type === 'boolean') merged.value = merged.operator === 'is_true';
          else if (v.type === 'number' && typeof merged.value !== 'number') merged.value = 1;
          else if (v.type === 'string' && typeof merged.value !== 'string') merged.value = '';
        }
      }
      return merged;
    });
    onChange({ ...group, rules: nextRules });
  };

  const removeRule = (ruleId: string) => {
    const nextRules = group.rules.filter((r) => r.id !== ruleId);
    onChange(nextRules.length === 0 ? undefined : { ...group, rules: nextRules });
  };

  return (
    <div className="p-2.5 rounded-md bg-[#FBFAF5] border border-[#E7E2D8] flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#706A60]">
          <span className="font-medium text-[#171513]">显示规则：</span>
          {group.rules.length > 0 && (
            <select
              value={group.logic}
              onChange={(e) =>
                onChange({ ...group, logic: e.target.value as ConditionGroup['logic'] })
              }
              className="paper-input py-0.5 px-2 text-[12px]"
            >
              <option value="all">全部满足（且）</option>
              <option value="any">任一满足（或）</option>
              <option value="not">不满足以下条件（非）</option>
            </select>
          )}
        </div>
        <button
          type="button"
          onClick={addRule}
          disabled={variables.length === 0}
          className="paper-btn-secondary px-2 py-0.5 text-[11.5px] inline-flex items-center gap-1"
        >
          <Plus size={12} />
          添加条件
        </button>
      </div>

      {group.rules.length === 0 ? (
        <div className="text-[11.5px] text-[#948D82]">
          {variables.length === 0
            ? '请先在「角色与状态」页面添加故事状态，即可设置条件规则。'
            : '当前无限制条件，所有玩家均可触发。'}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {group.rules.map((rule) => {
            const v = variables.find((item) => item.id === rule.variableId) ?? variables[0];
            const ops = v ? getOperatorsForVariableType(v.type) : [];
            return (
              <div key={rule.id} className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11.5px] text-[#706A60]">当</span>
                <select
                  value={rule.variableId}
                  onChange={(e) => updateRule(rule.id, { variableId: e.target.value })}
                  className="paper-input py-1 px-2 text-[12px]"
                >
                  {variables.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <select
                  value={rule.operator}
                  onChange={(e) =>
                    updateRule(rule.id, {
                      operator: e.target.value as ConditionRule['operator'],
                    })
                  }
                  className="paper-input py-1 px-2 text-[12px]"
                >
                  {ops.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {v?.type === 'number' && (
                  <input
                    type="number"
                    value={Number(rule.value)}
                    onChange={(e) => updateRule(rule.id, { value: Number(e.target.value) })}
                    className="paper-input w-20 py-1 px-2 text-[12px]"
                  />
                )}
                {v?.type === 'string' && (
                  <input
                    type="text"
                    value={String(rule.value ?? '')}
                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                    placeholder="输入文字"
                    className="paper-input w-28 py-1 px-2 text-[12px]"
                  />
                )}
                <button
                  type="button"
                  onClick={() => removeRule(rule.id)}
                  className="p-1 text-[#948D82] hover:text-[#C93B2B] cursor-pointer"
                  title="删除此条件"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
          <div className="text-[11px] text-[#2A7B50] bg-[#EDF7F1] px-2 py-1 rounded">
            规则说明：{formatConditionNatural(group, variables)}
          </div>
        </div>
      )}
    </div>
  );
};

interface EffectsEditorProps {
  effects: StateEffect[];
  variables: StoryVariable[];
  onChange: (next: StateEffect[]) => void;
  title?: string;
}

/**
 * Multi-Effect State Change Editor (Req 2.5):
 * Supports arbitrary Set / Add / Subtract values (NEVER restricted to +1!).
 */
export const StateEffectsEditor: React.FC<EffectsEditorProps> = ({
  effects,
  variables,
  onChange,
  title = '触发故事状态变更',
}) => {
  const addEffect = () => {
    const v = variables[0];
    if (!v) return;
    onChange([
      ...effects,
      {
        id: createId('eff'),
        variableId: v.id,
        op: v.type === 'number' ? 'add' : 'set',
        value: v.type === 'number' ? 1 : v.type === 'boolean' ? true : '',
      },
    ]);
  };

  const updateEffect = (id: string, patch: Partial<StateEffect>) => {
    onChange(
      effects.map((eff) => {
        if (eff.id !== id) return eff;
        const merged = { ...eff, ...patch };
        if (patch.variableId) {
          const v = variables.find((item) => item.id === patch.variableId);
          if (v) {
            if (v.type === 'boolean') {
              merged.op = 'set';
              merged.value = true;
            } else if (v.type === 'string') {
              merged.op = 'set';
              merged.value = '';
            } else if (typeof merged.value !== 'number') {
              merged.value = 1;
            }
          }
        }
        return merged;
      })
    );
  };

  return (
    <div className="p-2.5 rounded-md bg-[#FBFAF5] border border-[#E7E2D8] flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[#171513]">{title}</span>
        <button
          type="button"
          onClick={addEffect}
          disabled={variables.length === 0}
          className="paper-btn-secondary px-2 py-0.5 text-[11.5px] inline-flex items-center gap-1"
        >
          <Plus size={12} />
          添加状态变化
        </button>
      </div>
      {effects.length === 0 ? (
        <div className="text-[11.5px] text-[#948D82]">暂无状态变更效果</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {effects.map((eff) => {
            const v = variables.find((item) => item.id === eff.variableId) ?? variables[0];
            return (
              <div key={eff.id} className="flex items-center gap-1.5 flex-wrap">
                <select
                  value={eff.variableId}
                  onChange={(e) => updateEffect(eff.id, { variableId: e.target.value })}
                  className="paper-input py-1 px-2 text-[12px]"
                >
                  {variables.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                {v?.type === 'number' && (
                  <>
                    <select
                      value={eff.op}
                      onChange={(e) => updateEffect(eff.id, { op: e.target.value as StateEffect['op'] })}
                      className="paper-input py-1 px-2 text-[12px]"
                    >
                      <option value="add">增加</option>
                      <option value="sub">减少</option>
                      <option value="set">设置为</option>
                    </select>
                    <input
                      type="number"
                      value={Number(eff.value)}
                      onChange={(e) => updateEffect(eff.id, { value: Number(e.target.value) })}
                      className="paper-input w-20 py-1 px-2 text-[12px]"
                    />
                  </>
                )}
                {v?.type === 'boolean' && (
                  <select
                    value={eff.value ? 'true' : 'false'}
                    onChange={(e) => updateEffect(eff.id, { op: 'set', value: e.target.value === 'true' })}
                    className="paper-input py-1 px-2 text-[12px]"
                  >
                    <option value="true">设为 已开启</option>
                    <option value="false">设为 未开启</option>
                  </select>
                )}
                {v?.type === 'string' && (
                  <input
                    type="text"
                    value={String(eff.value ?? '')}
                    onChange={(e) => updateEffect(eff.id, { op: 'set', value: e.target.value })}
                    placeholder="设为指定文字"
                    className="paper-input w-32 py-1 px-2 text-[12px]"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onChange(effects.filter((x) => x.id !== eff.id))}
                  className="p-1 text-[#948D82] hover:text-[#C93B2B] cursor-pointer"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
