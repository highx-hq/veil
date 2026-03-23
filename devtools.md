# CPU Profile

| Duration | Spans | Functions |
|----------|-------|-----------|
| 39.1ms | 2190 | 90 |

**Top 10:** `git_ls_files_untracked` 40.5%, `new_from_subprocess_and_walk` 40.2%, `git_diff_index_repo_root` 39.9%, `git_ls_tree_repo_root_sorted` 39.5%, `repo_index_untracked_await` 37.5%, `walk_glob` 21.6%, `hash_objects` 19.2%, `resolve_lockfile` 15.7%, `resolve_package` 14.6%, `walk_candidate_files` 11.5%

## Hot Functions (Self Time)

| Self% | Self | Total% | Total | Function | Location |
|------:|-----:|-------:|------:|----------|----------|
| 40.5% | 15.8ms | 40.5% | 15.8ms | `git_ls_files_untracked` | `crates/turborepo-scm/src/ls_tree.rs:112` |
| 40.2% | 15.7ms | 40.2% | 15.7ms | `new_from_subprocess_and_walk` | `crates/turborepo-scm/src/repo_index.rs:202` |
| 39.9% | 15.6ms | 39.9% | 15.6ms | `git_diff_index_repo_root` | `crates/turborepo-scm/src/ls_tree.rs:77` |
| 39.5% | 15.4ms | 39.5% | 15.4ms | `git_ls_tree_repo_root_sorted` | `crates/turborepo-scm/src/ls_tree.rs:51` |
| 37.5% | 14.7ms | 37.5% | 14.7ms | `repo_index_untracked_await` | `crates/turborepo-lib/src/run/builder.rs:598` |
| 21.6% | 8.4ms | 21.6% | 8.4ms | `walk_glob` | `crates/turborepo-globwalk/src/lib.rs:740` |
| 19.2% | 7.5ms | 19.2% | 7.5ms | `hash_objects` | `crates/turborepo-scm/src/hash_object.rs:71` |
| 15.7% | 6.1ms | 15.9% | 6.2ms | `resolve_lockfile` | `crates/turborepo-repository/src/package_graph/builder.rs:507` |
| 14.6% | 5.7ms | 14.6% | 5.7ms | `resolve_package` | `crates/turborepo-lockfiles/src/bun/mod.rs:528` |
| 11.5% | 4.5ms | 11.5% | 4.5ms | `walk_candidate_files` | `crates/turborepo-scm/src/repo_index.rs:516` |
| 8.9% | 3.5ms | 21.6% | 8.4ms | `parse_lockfile` | `crates/turborepo-repository/src/package_manager/mod.rs:489` |
| 8.8% | 3.5ms | 8.8% | 3.5ms | `populate_transitive_dependencies` | `crates/turborepo-repository/src/package_graph/builder.rs:595` |
| 8.5% | 3.3ms | 8.5% | 3.3ms | `hash_scope` | `crates/turborepo-lib/src/run/mod.rs:620` |
| 7.9% | 3.1ms | 7.9% | 3.1ms | `format_node` | `/Users/runner/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/biome_formatter-0.5.7/src/lib.rs:1180` |
| 6.6% | 2.6ms | 6.6% | 2.6ms | `all_dependencies` | `crates/turborepo-lockfiles/src/bun/mod.rs:592` |
| 6.5% | 2.5ms | 6.5% | 2.5ms | `fetch` | `crates/turborepo-cache/src/fs.rs:76` |
| 6.5% | 2.5ms | 8.3% | 3.3ms | `calculate_file_hashes` | `crates/turborepo-task-hash/src/lib.rs:79` |
| 5.6% | 2.2ms | 6.0% | 2.3ms | `compile_globs` | `crates/turborepo-globwalk/src/lib.rs:538` |
| 4.5% | 1.7ms | 4.5% | 1.7ms | `parse` | `/Users/runner/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/biome_json_parser-0.5.7/src/lib.rs:32` |
| 4.2% | 1.6ms | 5.9% | 2.3ms | `parse_package_jsons` | `crates/turborepo-repository/src/package_graph/builder.rs:317` |
| 3.2% | 1.3ms | 3.3% | 1.3ms | `infer` | `crates/turborepo-repository/src/inference.rs:76` |
| 3.2% | 1.2ms | 3.5% | 1.4ms | `precompute_task_hashes` | `crates/turborepo-lib/src/task_graph/visitor/mod.rs:327` |
| 3.1% | 1.2ms | 3.4% | 1.3ms | `queue_task` | `crates/turborepo-lib/src/task_graph/visitor/mod.rs:360` |
| 2.0% | 788us | 2.0% | 788us | `Printer::print` | `/Users/runner/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/biome_formatter-0.5.7/src/printer/mod.rs:58` |
| 2.0% | 767us | 2.0% | 767us | `visit_recv_wait` | `crates/turborepo-lib/src/task_graph/visitor/mod.rs:355` |
| 1.8% | 696us | 1.8% | 696us | `calculate_task_hash` | `crates/turborepo-task-hash/src/lib.rs:318` |
| 1.3% | 492us | 1.3% | 492us | `build_engine` | `crates/turborepo-lib/src/run/builder.rs:698` |
| 1.1% | 439us | 10.0% | 3.9ms | `visit` | `crates/turborepo-lib/src/task_graph/visitor/mod.rs:311` |
| 1.1% | 433us | 45.4% | 17.8ms | `get_package_file_hashes_from_inputs_and_index` | `crates/turborepo-scm/src/package_deps.rs:300` |
| 1.0% | 393us | 1.0% | 393us | `new` | `crates/turborepo-lib/src/cli/mod.rs:357` |
| 0.9% | 356us | 7.4% | 2.9ms | `cache_restore` | `crates/turborepo-task-executor/src/exec.rs:421` |
| 0.7% | 288us | 0.7% | 288us | `turbo_json_preload` | `crates/turborepo-lib/src/run/builder.rs:502` |
| 0.6% | 224us | 0.6% | 224us | `process_output` | `crates/turborepo-ui/src/tui/app.rs:759` |
| 0.5% | 184us | 0.8% | 309us | `visitor_new` | `crates/turborepo-lib/src/task_graph/visitor/mod.rs:142` |
| 0.4% | 163us | 0.4% | 163us | `preprocess_paths_and_globs` | `crates/turborepo-globwalk/src/lib.rs:71` |

## Call Tree (Total Time)

| Total% | Total | Self% | Self | Function | Location |
|-------:|------:|------:|-----:|----------|----------|
| 45.6% | 17.8ms | 0.2% | 68us | `get_package_file_hashes` | `crates/turborepo-scm/src/package_deps.rs:24` |
| 45.4% | 17.8ms | 1.1% | 433us | `get_package_file_hashes_from_inputs_and_index` | `crates/turborepo-scm/src/package_deps.rs:300` |
| 40.5% | 15.8ms | 40.5% | 15.8ms | `git_ls_files_untracked` | `crates/turborepo-scm/src/ls_tree.rs:112` |
| 40.2% | 15.7ms | 0.0% | 7us | `build_repo_index_subprocesses` | `crates/turborepo-lib/src/run/builder.rs:392` |
| 40.2% | 15.7ms | 40.2% | 15.7ms | `new_from_subprocess_and_walk` | `crates/turborepo-scm/src/repo_index.rs:202` |
| 39.9% | 15.6ms | 39.9% | 15.6ms | `git_diff_index_repo_root` | `crates/turborepo-scm/src/ls_tree.rs:77` |
| 39.5% | 15.4ms | 39.5% | 15.4ms | `git_ls_tree_repo_root_sorted` | `crates/turborepo-scm/src/ls_tree.rs:51` |
| 37.5% | 14.7ms | 37.5% | 14.7ms | `repo_index_untracked_await` | `crates/turborepo-lib/src/run/builder.rs:598` |
| 30.7% | 12.0ms | 0.0% | 4us | `pkg_dep_graph_build` | `crates/turborepo-lib/src/run/builder.rs:352` |
| 30.7% | 12.0ms | 0.1% | 21us | `build` | `crates/turborepo-repository/src/package_graph/builder.rs:155` |
| 21.7% | 8.5ms | 0.2% | 65us | `read_lockfile` | `crates/turborepo-repository/src/package_manager/mod.rs:458` |
| 21.6% | 8.4ms | 21.6% | 8.4ms | `walk_glob` | `crates/turborepo-globwalk/src/lib.rs:740` |
| 21.6% | 8.4ms | 8.9% | 3.5ms | `parse_lockfile` | `crates/turborepo-repository/src/package_manager/mod.rs:489` |
| 19.8% | 7.8ms | 0.0% | 5us | `run` | `crates/turborepo-lib/src/run/mod.rs:799` |
| 19.8% | 7.8ms | 0.3% | 115us | `execute_visitor` | `crates/turborepo-lib/src/run/mod.rs:582` |
| 19.4% | 7.6ms | 0.3% | 134us | `get_package_file_hashes_from_index` | `crates/turborepo-scm/src/package_deps.rs:146` |
| 19.2% | 7.5ms | 19.2% | 7.5ms | `hash_objects` | `crates/turborepo-scm/src/hash_object.rs:71` |
| 15.9% | 6.2ms | 15.7% | 6.1ms | `resolve_lockfile` | `crates/turborepo-repository/src/package_graph/builder.rs:507` |
| 14.6% | 5.7ms | 14.6% | 5.7ms | `resolve_package` | `crates/turborepo-lockfiles/src/bun/mod.rs:528` |
| 11.5% | 4.5ms | 11.5% | 4.5ms | `walk_candidate_files` | `crates/turborepo-scm/src/repo_index.rs:516` |
| 10.0% | 3.9ms | 1.1% | 439us | `visit` | `crates/turborepo-lib/src/task_graph/visitor/mod.rs:311` |
| 8.9% | 3.5ms | 0.0% | 6us | `build_inner` | `crates/turborepo-repository/src/package_graph/builder.rs:614` |
| 8.8% | 3.5ms | 8.8% | 3.5ms | `populate_transitive_dependencies` | `crates/turborepo-repository/src/package_graph/builder.rs:595` |
| 8.5% | 3.3ms | 8.5% | 3.3ms | `hash_scope` | `crates/turborepo-lib/src/run/mod.rs:620` |
| 8.4% | 3.3ms | 0.0% | 7us | `calculate_file_hashes_task` | `crates/turborepo-lib/src/run/mod.rs:624` |
| 8.3% | 3.3ms | 6.5% | 2.5ms | `calculate_file_hashes` | `crates/turborepo-task-hash/src/lib.rs:79` |
| 7.9% | 3.1ms | 7.9% | 3.1ms | `format_node` | `/Users/runner/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/biome_formatter-0.5.7/src/lib.rs:1180` |
| 7.6% | 3.0ms | 0.2% | 67us | `execute_task` | `crates/turborepo-task-executor/src/exec.rs:276` |
| 7.4% | 2.9ms | 0.9% | 356us | `cache_restore` | `crates/turborepo-task-executor/src/exec.rs:421` |
| 6.6% | 2.6ms | 6.6% | 2.6ms | `all_dependencies` | `crates/turborepo-lockfiles/src/bun/mod.rs:592` |
| 6.5% | 2.5ms | 6.5% | 2.5ms | `fetch` | `crates/turborepo-cache/src/fs.rs:76` |
| 6.0% | 2.3ms | 5.6% | 2.2ms | `compile_globs` | `crates/turborepo-globwalk/src/lib.rs:538` |
| 5.9% | 2.3ms | 4.2% | 1.6ms | `parse_package_jsons` | `crates/turborepo-repository/src/package_graph/builder.rs:317` |
| 4.5% | 1.7ms | 4.5% | 1.7ms | `parse` | `/Users/runner/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/biome_json_parser-0.5.7/src/lib.rs:32` |
| 3.5% | 1.4ms | 3.2% | 1.2ms | `precompute_task_hashes` | `crates/turborepo-lib/src/task_graph/visitor/mod.rs:327` |
| 3.4% | 1.3ms | 3.1% | 1.2ms | `queue_task` | `crates/turborepo-lib/src/task_graph/visitor/mod.rs:360` |
| 3.3% | 1.3ms | 0.0% | 5us | `repo_inference` | `crates/turborepo-shim/src/run.rs:248` |
| 3.3% | 1.3ms | 3.2% | 1.3ms | `infer` | `crates/turborepo-repository/src/inference.rs:76` |
| 2.0% | 788us | 2.0% | 788us | `Printer::print` | `/Users/runner/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/biome_formatter-0.5.7/src/printer/mod.rs:58` |
| 2.0% | 767us | 2.0% | 767us | `visit_recv_wait` | `crates/turborepo-lib/src/task_graph/visitor/mod.rs:355` |
| 1.8% | 696us | 1.8% | 696us | `calculate_task_hash` | `crates/turborepo-task-hash/src/lib.rs:318` |
| 1.3% | 492us | 1.3% | 492us | `build_engine` | `crates/turborepo-lib/src/run/builder.rs:698` |
| 1.0% | 400us | 0.0% | 7us | `cli_arg_parsing` | `crates/turborepo-lib/src/cli/mod.rs:1392` |
| 1.0% | 393us | 1.0% | 393us | `new` | `crates/turborepo-lib/src/cli/mod.rs:357` |
| 0.8% | 309us | 0.5% | 184us | `visitor_new` | `crates/turborepo-lib/src/task_graph/visitor/mod.rs:142` |
| 0.7% | 288us | 0.7% | 288us | `turbo_json_preload` | `crates/turborepo-lib/src/run/builder.rs:502` |
| 0.6% | 224us | 0.6% | 224us | `process_output` | `crates/turborepo-ui/src/tui/app.rs:759` |
| 0.4% | 163us | 0.4% | 163us | `preprocess_paths_and_globs` | `crates/turborepo-globwalk/src/lib.rs:71` |

## Function Details

### `git_ls_files_untracked`
`crates/turborepo-scm/src/ls_tree.rs:112` | Self: 40.5% (15.8ms) | Total: 40.5% (15.8ms) | Calls: 1

### `new_from_subprocess_and_walk`
`crates/turborepo-scm/src/repo_index.rs:202` | Self: 40.2% (15.7ms) | Total: 40.2% (15.7ms) | Calls: 1

**Called by:**
- `build_repo_index_subprocesses` (1)

### `git_diff_index_repo_root`
`crates/turborepo-scm/src/ls_tree.rs:77` | Self: 39.9% (15.6ms) | Total: 39.9% (15.6ms) | Calls: 1

### `git_ls_tree_repo_root_sorted`
`crates/turborepo-scm/src/ls_tree.rs:51` | Self: 39.5% (15.4ms) | Total: 39.5% (15.4ms) | Calls: 1

### `repo_index_untracked_await`
`crates/turborepo-lib/src/run/builder.rs:598` | Self: 37.5% (14.7ms) | Total: 37.5% (14.7ms) | Calls: 1

### `walk_glob`
`crates/turborepo-globwalk/src/lib.rs:740` | Self: 21.6% (8.4ms) | Total: 21.6% (8.4ms) | Calls: 12

**Called by:**
- `get_package_file_hashes_from_inputs_and_index` (11)

### `hash_objects`
`crates/turborepo-scm/src/hash_object.rs:71` | Self: 19.2% (7.5ms) | Total: 19.2% (7.5ms) | Calls: 13

**Called by:**
- `get_package_file_hashes_from_index` (11)
- `get_package_file_hashes_from_inputs_and_index` (1)
- `collect_global_file_hash_inputs_task` (1)

### `resolve_lockfile`
`crates/turborepo-repository/src/package_graph/builder.rs:507` | Self: 15.7% (6.1ms) | Total: 15.9% (6.2ms) | Calls: 1

**Called by:**
- `build` (1)

**Calls:**
- `connect_internal_dependencies` (1)
- `populate_lockfile` (1)

### `resolve_package`
`crates/turborepo-lockfiles/src/bun/mod.rs:528` | Self: 14.6% (5.7ms) | Total: 14.6% (5.7ms) | Calls: 1161

### `walk_candidate_files`
`crates/turborepo-scm/src/repo_index.rs:516` | Self: 11.5% (4.5ms) | Total: 11.5% (4.5ms) | Calls: 1

### `parse_lockfile`
`crates/turborepo-repository/src/package_manager/mod.rs:489` | Self: 8.9% (3.5ms) | Total: 21.6% (8.4ms) | Calls: 1

**Called by:**
- `read_lockfile` (1)

**Calls:**
- `format_node` (1)
- `parse` (1)
- `Printer::print` (1)

### `populate_transitive_dependencies`
`crates/turborepo-repository/src/package_graph/builder.rs:595` | Self: 8.8% (3.5ms) | Total: 8.8% (3.5ms) | Calls: 1

**Called by:**
- `build_inner` (1)

### `hash_scope`
`crates/turborepo-lib/src/run/mod.rs:620` | Self: 8.5% (3.3ms) | Total: 8.5% (3.3ms) | Calls: 1

**Called by:**
- `execute_visitor` (1)

### `format_node`
`/Users/runner/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/biome_formatter-0.5.7/src/lib.rs:1180` | Self: 7.9% (3.1ms) | Total: 7.9% (3.1ms) | Calls: 1

**Called by:**
- `parse_lockfile` (1)

### `all_dependencies`
`crates/turborepo-lockfiles/src/bun/mod.rs:592` | Self: 6.6% (2.6ms) | Total: 6.6% (2.6ms) | Calls: 618

### `fetch`
`crates/turborepo-cache/src/fs.rs:76` | Self: 6.5% (2.5ms) | Total: 6.5% (2.5ms) | Calls: 9

**Called by:**
- `cache_restore` (9)

### `calculate_file_hashes`
`crates/turborepo-task-hash/src/lib.rs:79` | Self: 6.5% (2.5ms) | Total: 8.3% (3.3ms) | Calls: 1

**Called by:**
- `calculate_file_hashes_task` (1)

**Calls:**
- `get_package_file_hashes` (1)

### `compile_globs`
`crates/turborepo-globwalk/src/lib.rs:538` | Self: 5.6% (2.2ms) | Total: 6.0% (2.3ms) | Calls: 13

**Called by:**
- `parse_package_jsons` (1)
- `get_package_file_hashes_from_inputs_and_index` (11)

**Calls:**
- `preprocess_paths_and_globs` (13)

### `parse`
`/Users/runner/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/biome_json_parser-0.5.7/src/lib.rs:32` | Self: 4.5% (1.7ms) | Total: 4.5% (1.7ms) | Calls: 19

**Called by:**
- `parse_lockfile` (1)
- `root_turbo_json_load` (1)
- `infer` (1)
- `load_config` (1)

### `parse_package_jsons`
`crates/turborepo-repository/src/package_graph/builder.rs:317` | Self: 4.2% (1.6ms) | Total: 5.9% (2.3ms) | Calls: 1

**Called by:**
- `build` (1)

**Calls:**
- `compile_globs` (1)

### `infer`
`crates/turborepo-repository/src/inference.rs:76` | Self: 3.2% (1.3ms) | Total: 3.3% (1.3ms) | Calls: 1

**Called by:**
- `repo_inference` (1)

**Calls:**
- `parse` (1)

### `precompute_task_hashes`
`crates/turborepo-lib/src/task_graph/visitor/mod.rs:327` | Self: 3.2% (1.2ms) | Total: 3.5% (1.4ms) | Calls: 1

**Called by:**
- `visit` (1)

**Calls:**
- `calculate_task_hash` (2)

### `queue_task`
`crates/turborepo-lib/src/task_graph/visitor/mod.rs:360` | Self: 3.1% (1.2ms) | Total: 3.4% (1.3ms) | Calls: 12

**Called by:**
- `visit` (12)

**Calls:**
- `exec_context_new` (12)
- `task_cache_new` (12)

### `Printer::print`
`/Users/runner/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/biome_formatter-0.5.7/src/printer/mod.rs:58` | Self: 2.0% (788us) | Total: 2.0% (788us) | Calls: 1

**Called by:**
- `parse_lockfile` (1)

### `visit_recv_wait`
`crates/turborepo-lib/src/task_graph/visitor/mod.rs:355` | Self: 2.0% (767us) | Total: 2.0% (767us) | Calls: 13

**Called by:**
- `visit` (13)

### `calculate_task_hash`
`crates/turborepo-task-hash/src/lib.rs:318` | Self: 1.8% (696us) | Total: 1.8% (696us) | Calls: 12

**Called by:**
- `precompute_task_hashes` (2)

### `build_engine`
`crates/turborepo-lib/src/run/builder.rs:698` | Self: 1.3% (492us) | Total: 1.3% (492us) | Calls: 1

### `visit`
`crates/turborepo-lib/src/task_graph/visitor/mod.rs:311` | Self: 1.1% (439us) | Total: 10.0% (3.9ms) | Calls: 1

**Called by:**
- `execute_visitor` (1)

**Calls:**
- `precompute_task_hashes` (1)
- `queue_task` (12)
- `visit_recv_wait` (13)

### `get_package_file_hashes_from_inputs_and_index`
`crates/turborepo-scm/src/package_deps.rs:300` | Self: 1.1% (433us) | Total: 45.4% (17.8ms) | Calls: 11

**Called by:**
- `get_package_file_hashes` (11)

**Calls:**
- `get_package_file_hashes_from_index` (11)
- `hash_objects` (1)
- `compile_globs` (11)
- `walk_glob` (11)

### `new`
`crates/turborepo-lib/src/cli/mod.rs:357` | Self: 1.0% (393us) | Total: 1.0% (393us) | Calls: 1

**Called by:**
- `cli_arg_parsing` (1)

### `cache_restore`
`crates/turborepo-task-executor/src/exec.rs:421` | Self: 0.9% (356us) | Total: 7.4% (2.9ms) | Calls: 9

**Called by:**
- `execute_task` (9)

**Calls:**
- `fetch` (9)

### `turbo_json_preload`
`crates/turborepo-lib/src/run/builder.rs:502` | Self: 0.7% (288us) | Total: 0.7% (288us) | Calls: 1

### `process_output`
`crates/turborepo-ui/src/tui/app.rs:759` | Self: 0.6% (224us) | Total: 0.6% (224us) | Calls: 117

